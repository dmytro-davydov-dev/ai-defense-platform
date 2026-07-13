import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { HealthController } from "./health/health.controller";
import { StorageModule } from "./storage/storage.module";

@Module({
  imports: [StorageModule],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule {}
