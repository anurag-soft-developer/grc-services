import { Controller, Get, Query } from '@nestjs/common';
import { Roles, UserRole } from '../auth/decorators/roles.decorator';
import { DashboardService } from './dashboard.service';
import { DashboardAnalyticsQueryDto } from './dto/dashboard-analytics.dto';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Roles(UserRole.ADMIN)
  @Get('analytics')
  async getAnalytics(@Query() query: DashboardAnalyticsQueryDto) {
    return this.dashboardService.getAnalytics(query.fromDate, query.toDate);
  }
}
