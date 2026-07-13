import { Injectable } from "@nestjs/common";

@Injectable()
export class AppService {
  getServiceInfo(): { service: string; phase: number } {
    return { service: "ai-defense-api", phase: 1 };
  }
}
