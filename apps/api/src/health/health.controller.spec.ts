import { Test, type TestingModule } from "@nestjs/testing";
import { HealthController } from "./health.controller";

describe("HealthController", () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it("reports health as ok", () => {
    expect(controller.getHealth()).toEqual({ status: "ok" });
  });

  it("reports ready as ready", () => {
    expect(controller.getReady()).toEqual({ status: "ready" });
  });
});
