import {
  Body,
  Controller,
  Get,
  Put,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { StarMapService } from './starmap.service';
import {
  StarMapConnectionsResult,
  StarMapResult,
  UpdateWeatherPreferenceDto,
  WeatherInfo,
  WeatherPreference,
} from './dto/starmap.dto';

@Controller()
export class StarMapController {
  constructor(private readonly starMapService: StarMapService) {}

  /** 认知星图数据 */
  @Get('starmap')
  getStarMap(@CurrentUser('sub') userId: string): Promise<StarMapResult> {
    return this.starMapService.getStarMap(userId);
  }

  /** 天气与节日信息（氛围层） */
  @Get('starmap/weather')
  getWeather(@CurrentUser('sub') userId: string): Promise<WeatherInfo> {
    return this.starMapService.getWeather(userId);
  }

  /** 引用连线数据（氛围层） */
  @Get('starmap/connections')
  getConnections(
    @CurrentUser('sub') userId: string,
  ): Promise<StarMapConnectionsResult> {
    return this.starMapService.getConnections(userId);
  }

  /** 天气偏好设置（跟随本地 / 自定义 / 氛围开关） */
  @Put('users/me/weather_preference')
  updateWeatherPreference(
    @CurrentUser('sub') userId: string,
    @Body() dto: UpdateWeatherPreferenceDto,
  ): Promise<WeatherPreference> {
    return this.starMapService.updateWeatherPreference(userId, dto);
  }
}
