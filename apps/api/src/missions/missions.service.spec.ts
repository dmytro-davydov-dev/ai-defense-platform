import { ConflictException, NotFoundException } from "@nestjs/common";
import { MissionStatus } from "../../generated/prisma/client";
import { MissionsService } from "./missions.service";
import type { MissionRecord } from "./mission.types";

describe("MissionsService (REQ-2.7/2.8/2.13)", () => {
  const baseMission: MissionRecord = {
    id: "mission-1",
    title: "Test mission",
    description: null,
    status: MissionStatus.DRAFT,
    videoObjectKey: null,
    createdById: "user-1",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    archivedAt: null,
  };

  let repo: {
    create: jest.Mock;
    findById: jest.Mock;
    findAll: jest.Mock;
    updateMetadata: jest.Mock;
    updateStatus: jest.Mock;
    setVideoObjectKey: jest.Mock;
    softDelete: jest.Mock;
    archive: jest.Mock;
    unarchive: jest.Mock;
  };
  let audit: { record: jest.Mock };
  let outbox: { insert: jest.Mock };
  let prisma: { $transaction: jest.Mock };
  let service: MissionsService;

  beforeEach(() => {
    repo = {
      create: jest.fn(),
      findById: jest.fn(),
      findAll: jest.fn(),
      updateMetadata: jest.fn(),
      updateStatus: jest.fn(),
      setVideoObjectKey: jest.fn(),
      softDelete: jest.fn().mockResolvedValue(undefined),
      archive: jest.fn().mockResolvedValue(undefined),
      unarchive: jest.fn().mockResolvedValue(undefined),
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    outbox = { insert: jest.fn().mockResolvedValue("event-1") };
    prisma = {
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        callback("fake-tx"),
      ),
    };

    service = new MissionsService(
      repo as any,
      audit as any,
      outbox as any,
      prisma as any,
    );
  });

  describe("createMission", () => {
    it("creates the mission and writes an audit record inside the same transaction", async () => {
      repo.create.mockResolvedValue(baseMission);

      const result = await service.createMission(
        { title: "Test mission", createdById: "user-1" },
        { actorUserId: "user-1", correlationId: "corr-1" },
      );

      expect(result).toBe(baseMission);
      expect(repo.create).toHaveBeenCalledWith(
        { title: "Test mission", createdById: "user-1" },
        "fake-tx",
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "mission.created",
          missionId: baseMission.id,
        }),
        "fake-tx",
      );
    });
  });

  describe("getMission", () => {
    it("throws NotFoundException when the mission doesn't exist", async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.getMission("missing")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("updateMetadata", () => {
    it("rejects edits once the mission has left DRAFT", async () => {
      repo.findById.mockResolvedValue({
        ...baseMission,
        status: MissionStatus.QUEUED,
      });
      await expect(
        service.updateMetadata(
          "mission-1",
          { title: "new" },
          { actorUserId: "user-1" },
        ),
      ).rejects.toThrow(ConflictException);
    });

    it("allows edits while DRAFT", async () => {
      repo.findById.mockResolvedValue(baseMission);
      repo.updateMetadata.mockResolvedValue({ ...baseMission, title: "new" });

      const result = await service.updateMetadata(
        "mission-1",
        { title: "new" },
        { actorUserId: "user-1" },
      );

      expect(result.title).toBe("new");
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: "mission.metadata_updated" }),
        "fake-tx",
      );
    });
  });

  describe("transition", () => {
    it("rejects an illegal transition with the stable error code", async () => {
      repo.findById.mockResolvedValue(baseMission); // DRAFT

      await expect(
        service.transition("mission-1", MissionStatus.COMPLETED, {
          actorUserId: "user-1",
        }),
      ).rejects.toThrow(/MISSION_ILLEGAL_TRANSITION/);
    });

    it("rejects DRAFT -> QUEUED without a video attached", async () => {
      repo.findById.mockResolvedValue(baseMission); // videoObjectKey: null

      await expect(
        service.transition("mission-1", MissionStatus.QUEUED, {
          actorUserId: "user-1",
        }),
      ).rejects.toThrow(/MISSION_VIDEO_REQUIRED/);
    });

    it("allows DRAFT -> QUEUED once a video is attached, and audits the transition", async () => {
      const withVideo = {
        ...baseMission,
        videoObjectKey: "missions/mission-1/video.mp4",
      };
      repo.findById
        .mockResolvedValueOnce(withVideo) // outer read
        .mockResolvedValueOnce(withVideo); // re-read inside the transaction
      repo.updateStatus.mockResolvedValue({
        ...withVideo,
        status: MissionStatus.QUEUED,
      });

      const result = await service.transition(
        "mission-1",
        MissionStatus.QUEUED,
        {
          actorUserId: "user-1",
          correlationId: "corr-2",
        },
      );

      expect(result.status).toBe(MissionStatus.QUEUED);
      expect(repo.updateStatus).toHaveBeenCalledWith(
        "mission-1",
        MissionStatus.QUEUED,
        "fake-tx",
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "mission.transition",
          metadata: { from: MissionStatus.DRAFT, to: MissionStatus.QUEUED },
        }),
        "fake-tx",
      );
    });

    it("writes an outbox row (REQ-3.6) only on DRAFT -> QUEUED, in the same transaction", async () => {
      const withVideo = {
        ...baseMission,
        videoObjectKey: "missions/mission-1/video.mp4",
      };
      repo.findById
        .mockResolvedValueOnce(withVideo)
        .mockResolvedValueOnce(withVideo);
      repo.updateStatus.mockResolvedValue({
        ...withVideo,
        status: MissionStatus.QUEUED,
      });

      await service.transition("mission-1", MissionStatus.QUEUED, {
        actorUserId: "user-1",
        correlationId: "corr-2",
      });

      expect(outbox.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          aggregateType: "mission",
          aggregateId: "mission-1",
          eventType: "MISSION_PROCESSING_REQUESTED",
          payload: {
            missionId: "mission-1",
            videoObjectKey: "missions/mission-1/video.mp4",
          },
          correlationId: "corr-2",
          causationId: null,
        }),
        "fake-tx",
      );
    });

    it("does not write an outbox row for a non-DRAFT->QUEUED transition", async () => {
      const processing = { ...baseMission, status: MissionStatus.PROCESSING };
      repo.findById
        .mockResolvedValueOnce(processing)
        .mockResolvedValueOnce(processing);
      repo.updateStatus.mockResolvedValue({
        ...processing,
        status: MissionStatus.COMPLETED,
      });

      await service.transition("mission-1", MissionStatus.COMPLETED, {
        actorUserId: "user-1",
      });

      expect(outbox.insert).not.toHaveBeenCalled();
    });

    it("rejects with MISSION_STATE_CHANGED_CONCURRENTLY if the status changed between read and write", async () => {
      const withVideo = {
        ...baseMission,
        videoObjectKey: "missions/mission-1/video.mp4",
      };
      repo.findById
        .mockResolvedValueOnce(withVideo) // outer read: still DRAFT
        .mockResolvedValueOnce({ ...withVideo, status: MissionStatus.QUEUED }); // someone else already moved it

      await expect(
        service.transition("mission-1", MissionStatus.QUEUED, {
          actorUserId: "user-1",
        }),
      ).rejects.toThrow(/MISSION_STATE_CHANGED_CONCURRENTLY/);
    });
  });

  describe("deleteMission", () => {
    it("throws NotFoundException when the mission doesn't exist", async () => {
      repo.findById.mockResolvedValue(null);
      await expect(
        service.deleteMission("missing", { actorUserId: "user-1" }),
      ).rejects.toThrow(NotFoundException);
      expect(repo.softDelete).not.toHaveBeenCalled();
    });

    it("rejects deletion once the mission has left DRAFT", async () => {
      repo.findById.mockResolvedValue({
        ...baseMission,
        status: MissionStatus.QUEUED,
      });
      await expect(
        service.deleteMission("mission-1", { actorUserId: "user-1" }),
      ).rejects.toThrow(ConflictException);
      expect(repo.softDelete).not.toHaveBeenCalled();
    });

    it("soft-deletes a DRAFT mission and writes an audit record inside the same transaction", async () => {
      repo.findById.mockResolvedValue(baseMission);

      await service.deleteMission("mission-1", {
        actorUserId: "user-1",
        correlationId: "corr-1",
      });

      expect(repo.softDelete).toHaveBeenCalledWith("mission-1", "fake-tx");
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "mission.deleted",
          missionId: "mission-1",
          actorUserId: "user-1",
          correlationId: "corr-1",
        }),
        "fake-tx",
      );
    });
  });

  describe("archiveMission", () => {
    it("throws NotFoundException when the mission doesn't exist", async () => {
      repo.findById.mockResolvedValue(null);
      await expect(
        service.archiveMission("missing", { actorUserId: "user-1" }),
      ).rejects.toThrow(NotFoundException);
      expect(repo.archive).not.toHaveBeenCalled();
    });

    it("archives a mission regardless of status and writes an audit record inside the same transaction", async () => {
      const queued = { ...baseMission, status: MissionStatus.QUEUED };
      repo.findById
        .mockResolvedValueOnce(queued) // getMission()
        .mockResolvedValueOnce({
          ...queued,
          archivedAt: new Date("2026-07-17T00:00:00Z"),
        }); // re-read inside the transaction

      const result = await service.archiveMission("mission-1", {
        actorUserId: "user-1",
        correlationId: "corr-1",
      });

      expect(result.archivedAt).toEqual(new Date("2026-07-17T00:00:00Z"));
      expect(repo.archive).toHaveBeenCalledWith("mission-1", "fake-tx");
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "mission.archived",
          missionId: "mission-1",
          actorUserId: "user-1",
          correlationId: "corr-1",
        }),
        "fake-tx",
      );
    });
  });

  describe("unarchiveMission", () => {
    it("throws NotFoundException when the mission doesn't exist", async () => {
      repo.findById.mockResolvedValue(null);
      await expect(
        service.unarchiveMission("missing", { actorUserId: "user-1" }),
      ).rejects.toThrow(NotFoundException);
      expect(repo.unarchive).not.toHaveBeenCalled();
    });

    it("unarchives a mission and writes an audit record inside the same transaction", async () => {
      const archived = {
        ...baseMission,
        archivedAt: new Date("2026-07-17T00:00:00Z"),
      };
      repo.findById
        .mockResolvedValueOnce(archived) // getMission()
        .mockResolvedValueOnce(baseMission); // re-read inside the transaction, archivedAt cleared

      const result = await service.unarchiveMission("mission-1", {
        actorUserId: "user-1",
        correlationId: "corr-1",
      });

      expect(result.archivedAt).toBeNull();
      expect(repo.unarchive).toHaveBeenCalledWith("mission-1", "fake-tx");
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "mission.unarchived",
          missionId: "mission-1",
          actorUserId: "user-1",
          correlationId: "corr-1",
        }),
        "fake-tx",
      );
    });
  });

  describe("listMissions", () => {
    it("defaults includeArchived to false", async () => {
      repo.findAll.mockResolvedValue([]);
      await service.listMissions();
      expect(repo.findAll).toHaveBeenCalledWith(false);
    });

    it("passes includeArchived through when set", async () => {
      repo.findAll.mockResolvedValue([]);
      await service.listMissions(true);
      expect(repo.findAll).toHaveBeenCalledWith(true);
    });
  });

  describe("attachVideo", () => {
    it("rejects once the mission has left DRAFT", async () => {
      repo.findById.mockResolvedValue({
        ...baseMission,
        status: MissionStatus.PROCESSING,
      });
      await expect(
        service.attachVideo("mission-1", "missions/mission-1/video.mp4", {
          actorUserId: "user-1",
        }),
      ).rejects.toThrow(ConflictException);
    });
  });
});
