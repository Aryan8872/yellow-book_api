import { TimeRangeDto } from '../../../analytics/dto/time-range.dto';

export function calculateTimeRange(dto: TimeRangeDto): { startDate: Date; endDate: Date } {
  const now = new Date();
  let startDate: Date;
  let endDate: Date = now;

  if (dto.range === 'custom') {
    startDate = dto.startDate ? new Date(dto.startDate) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    endDate = dto.endDate ? new Date(dto.endDate) : now;
  } else if (dto.range === '7d') {
    startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (dto.range === '90d') {
    startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  } else {
    // 30d default
    startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  return { startDate, endDate };
}
