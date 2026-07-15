import { MissionEventsGateway } from "./mission-events.gateway";

function fakeSocket(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "socket-1",
    data: {},
    handshake: { headers: {} },
    disconnect: jest.fn(),
    join: jest.fn().mockResolvedValue(undefined),
    leave: jest.fn().mockResolvedValue(undefined),
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("MissionEventsGateway (REQ-6.5)", () => {
  let jwtService: { verifyAsync: jest.Mock };
  let gateway: MissionEventsGateway;

  beforeEach(() => {
    jwtService = { verifyAsync: jest.fn() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    gateway = new MissionEventsGateway(jwtService as any);
  });

  describe("handleConnection", () => {
    it("disconnects a socket with no token", async () => {
      const client = fakeSocket({ handshake: { headers: {} } });

      await gateway.handleConnection(client);

      expect(jwtService.verifyAsync).not.toHaveBeenCalled();
      expect(client.disconnect).toHaveBeenCalledWith(true);
    });

    it("accepts a socket with a valid token and records the userId", async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: "user-1",
        email: "a@b.com",
        roles: ["operator"],
      });
      const client = fakeSocket({
        handshake: { auth: { token: "good-token" }, headers: {} },
      });

      await gateway.handleConnection(client);

      expect(jwtService.verifyAsync).toHaveBeenCalledWith("good-token");
      expect(client.disconnect).not.toHaveBeenCalled();
      expect(client.data.userId).toBe("user-1");
    });

    it("disconnects a socket whose token fails verification", async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error("jwt expired"));
      const client = fakeSocket({
        handshake: { auth: { token: "bad-token" }, headers: {} },
      });

      await gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalledWith(true);
    });

    it("disconnects a socket whose token payload has no sub claim", async () => {
      jwtService.verifyAsync.mockResolvedValue({ email: "a@b.com" });
      const client = fakeSocket({
        handshake: { auth: { token: "no-sub" }, headers: {} },
      });

      await gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalledWith(true);
    });
  });

  describe("subscribeMission/unsubscribeMission", () => {
    it("joins the mission's room", () => {
      const client = fakeSocket();

      gateway.handleSubscribeMission(client, { missionId: "mission-1" });

      expect(client.join).toHaveBeenCalledWith("mission:mission-1");
    });

    it("ignores a subscribe call with no missionId", () => {
      const client = fakeSocket();

      gateway.handleSubscribeMission(client, {});

      expect(client.join).not.toHaveBeenCalled();
    });

    it("leaves the mission's room", () => {
      const client = fakeSocket();

      gateway.handleUnsubscribeMission(client, { missionId: "mission-1" });

      expect(client.leave).toHaveBeenCalledWith("mission:mission-1");
    });
  });

  describe("publishMissionEvent", () => {
    it("emits to the mission's room via the underlying server", () => {
      const emit = jest.fn();
      const to = jest.fn().mockReturnValue({ emit });
      // The gateway's `server` is set by Nest's @WebSocketServer()
      // decorator at runtime; assign it directly here to test
      // publishMissionEvent in isolation.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (gateway as any).server = { to };

      gateway.publishMissionEvent("mission-1", {
        eventType: "PROCESSING_COMPLETED",
        payload: { missionId: "mission-1" },
      });

      expect(to).toHaveBeenCalledWith("mission:mission-1");
      expect(emit).toHaveBeenCalledWith("missionEvent", {
        eventType: "PROCESSING_COMPLETED",
        payload: { missionId: "mission-1" },
      });
    });

    it("does not throw if the server isn't set yet", () => {
      expect(() => {
        gateway.publishMissionEvent("mission-1", {
          eventType: "PROCESSING_COMPLETED",
          payload: {},
        });
      }).not.toThrow();
    });
  });
});
