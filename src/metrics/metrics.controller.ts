import { Controller, Get, UseGuards } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { SuperAdminGuard } from '@src/custom/guards/admin.guard';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  @UseGuards(SuperAdminGuard)
  async getMetrics() {
    return this.metricsService.getMetrics();
  }
}
