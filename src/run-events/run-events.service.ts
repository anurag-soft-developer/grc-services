import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PopulateOptions } from 'mongoose';
import type { PaginatedResult } from '../core/interfaces/common';
import { buildPaginatedResult } from '../core/utils/pagination.util';
import { userSelectFields } from '../users/schemas/user.schema';
import { CreateRunEventDto, ListPublishedRunEventsDto, ListRunEventsDto, UpdateRunEventDto } from './dto/run-events.dto';
import {
  PublicRunEventSegment,
  RunEventStatus,
} from './interfaces/run-event.interface';
import {
  RunEvent,
  RunEventDocument,
  runEventRegistrationSelectFields,
} from './schemas/run-event.schema';
import { RunEventsRegistrationUtility } from './utility/run-events-registration.utility';
import {
  buildCityFilterValue,
  type EventDateRangeFilter,
  startOfTodayUtc,
} from './utility/run-events-list-filter.util';
import { RunEventsUtility } from './utility/run-events.utility';

@Injectable()
export class RunEventsService {
  static populateOptions: PopulateOptions[] = [
    {
      path: 'createdBy',
      select: userSelectFields,
    },
  ];

  constructor(
    @InjectModel(RunEvent.name) private runEventModel: Model<RunEvent>,
  ) {}

  getEventsCollectionName(): string {
    return this.runEventModel.collection.name;
  }

  async create(
    dto: CreateRunEventDto,
    createdBy: string,
  ): Promise<RunEventDocument> {
    const slug = await RunEventsUtility.generateUniqueSlug(
      this.runEventModel,
      dto.title,
    );
    RunEventsUtility.validateCustomQuestionKeys(
      dto.customQuestions?.map((q) => q.key) ?? [],
    );

    const event = new this.runEventModel({
      ...dto,
      location: RunEventsUtility.buildLocation(dto.location),
      slug,
      createdBy,
      status: RunEventStatus.DRAFT,
    });

    return (await event.save()).populate(RunEventsService.populateOptions);
  }

  async findAll(
    query: ListRunEventsDto,
  ): Promise<PaginatedResult<RunEventDocument>> {
    const {
      status,
      segment,
      page = 1,
      limit = 10,
      lat,
      long,
      maxDistanceMeters,
      isClosed,
      archive,
      eventDate,
      city,
    } = query;
    const filter: Record<string, unknown> = {};
    if (status) {
      filter.status = status;
    }
    if (archive !== undefined) {
      filter.archive = archive;
    }
    if (segment) {
      this.applySegmentFilter(filter, segment, eventDate);
    } else if (eventDate) {
      filter.eventDate = eventDate;
    }
    if (isClosed !== undefined && segment === undefined) {
      filter.isClosed = isClosed;
    }
    if (city) {
      filter['location.city'] = buildCityFilterValue(city);
    }

    if (lat !== undefined && long !== undefined) {
      return RunEventsUtility.findAllByDistance(
        this.runEventModel,
        RunEventsService.populateOptions,
        filter,
        lat,
        long,
        page,
        limit,
        maxDistanceMeters,
      );
    }

    const skip = (page - 1) * limit;
    const [events, total] = await Promise.all([
      this.runEventModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate(RunEventsService.populateOptions)
        .exec(),
      this.runEventModel.countDocuments(filter).exec(),
    ]);

    return buildPaginatedResult(events, total, page, limit);
  }

  private applySegmentFilter(
    filter: Record<string, unknown>,
    segment: PublicRunEventSegment | undefined,
    eventDate?: EventDateRangeFilter,
  ): void {
    if (!segment) {
      const upcoming: Record<string, unknown> = { isClosed: false };
      const closed: Record<string, unknown> = { isClosed: true };

      if (eventDate) {
        upcoming.eventDate = eventDate;
        closed.eventDate = eventDate;
      } else {
        upcoming.eventDate = { $gte: startOfTodayUtc() };
      }

      filter.$or = [upcoming, closed];
      return;
    }

    if (segment === 'upcoming') {
      filter.isClosed = false;
      if (eventDate) {
        filter.eventDate = eventDate;
      } else {
        filter.eventDate = { $gte: startOfTodayUtc() };
      }
      return;
    }

    filter.isClosed = true;
    if (eventDate) {
      filter.eventDate = eventDate;
    }
  }

  private buildPublicFilter(
    segment: PublicRunEventSegment | undefined,
    eventDate?: EventDateRangeFilter,
    city?: string,
  ): Record<string, unknown> {
    const filter: Record<string, unknown> = {
      status: RunEventStatus.PUBLISHED,
      archive: false,
    };

    this.applySegmentFilter(filter, segment, eventDate);

    if (city) {
      filter['location.city'] = buildCityFilterValue(city);
    }

    return filter;
  }

  private sortForPublicSegment(
    segment: PublicRunEventSegment | undefined,
  ): Record<string, 1 | -1> {
    if (!segment) {
      return { isClosed: 1, eventDate: 1, closedAt: -1 };
    }
    if (segment === 'upcoming') {
      return { eventDate: 1 };
    }
    return { closedAt: -1, eventDate: -1 };
  }

  async findPublic(
    query: ListPublishedRunEventsDto,
  ): Promise<PaginatedResult<RunEventDocument>> {
    const {
      segment,
      page = 1,
      limit = 10,
      lat,
      long,
      maxDistanceMeters,
      eventDate,
      city,
    } = query;
    const filter = this.buildPublicFilter(segment, eventDate, city);
    const sort = this.sortForPublicSegment(segment);

    if (lat !== undefined && long !== undefined) {
      return RunEventsUtility.findAllByDistance(
        this.runEventModel,
        RunEventsService.populateOptions,
        filter,
        lat,
        long,
        page,
        limit,
        maxDistanceMeters,
        sort,
      );
    }

    const skip = (page - 1) * limit;
    const [events, total] = await Promise.all([
      this.runEventModel
        .find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate(RunEventsService.populateOptions)
        .exec(),
      this.runEventModel.countDocuments(filter).exec(),
    ]);

    return buildPaginatedResult(events, total, page, limit);
  }

  async findById(id: string): Promise<RunEventDocument> {
    const event = await this.runEventModel
      .findById(id)
      .populate(RunEventsService.populateOptions)
      .exec();
    if (!event) {
      throw new NotFoundException('Run event not found');
    }
    return event;
  }

  async reserveRegistrationSlot(runEventId: string): Promise<RunEventDocument> {
    return RunEventsRegistrationUtility.reserveRegistrationSlot(
      this.runEventModel,
      runEventId,
    );
  }

  async releaseRegistrationSlot(runEventId: string): Promise<void> {
    return RunEventsRegistrationUtility.releaseRegistrationSlot(
      this.runEventModel,
      runEventId,
    );
  }

  async releaseRegistrationSlots(
    runEventId: string,
    count: number,
  ): Promise<void> {
    return RunEventsRegistrationUtility.releaseRegistrationSlots(
      this.runEventModel,
      runEventId,
      count,
    );
  }

  async findPublishedBySlug(slug: string): Promise<RunEventDocument> {
    const event = await this.runEventModel
      .findOne({
        slug: slug.toLowerCase(),
        status: RunEventStatus.PUBLISHED,
        archive: false,
      })
      .populate(RunEventsService.populateOptions)
      .exec();

    if (!event) {
      throw new NotFoundException('Run event not found');
    }

    return event;
  }

  async update(id: string, dto: UpdateRunEventDto): Promise<RunEventDocument> {
    const event = await this.runEventModel.findById(id).exec();
    if (!event) {
      throw new NotFoundException('Run event not found');
    }

    if (dto.customQuestions) {
      RunEventsUtility.validateCustomQuestionKeys(
        dto.customQuestions.map((q) => q.key),
      );
    }

    if (dto.title && dto.title !== event.title) {
      event.slug = await RunEventsUtility.generateUniqueSlug(
        this.runEventModel,
        dto.title,
        id,
      );
    }

    const { location, ...rest } = dto;
    Object.assign(event, rest);

    if (location) {
      event.location = RunEventsUtility.buildLocation(location);
      event.markModified('location');
    }

    return (await event.save()).populate(RunEventsService.populateOptions);
  }

  async publish(id: string): Promise<RunEventDocument> {
    const event = await this.runEventModel.findById(id).exec();
    if (!event) {
      throw new NotFoundException('Run event not found');
    }
    event.status = RunEventStatus.PUBLISHED;
    if (!event.publishedAt) {
      event.publishedAt = new Date();
    }
    return (await event.save()).populate(RunEventsService.populateOptions);
  }

  async close(id: string): Promise<RunEventDocument> {
    const event = await this.runEventModel.findById(id).exec();
    if (!event) {
      throw new NotFoundException('Run event not found');
    }
    if (event.status !== RunEventStatus.PUBLISHED) {
      throw new BadRequestException('Only published events can be closed');
    }
    if (event.isClosed) {
      throw new BadRequestException('Event is already closed');
    }
    event.isClosed = true;
    event.closedAt = new Date();
    return (await event.save()).populate(RunEventsService.populateOptions);
  }

  async archive(id: string): Promise<RunEventDocument> {
    const event = await this.runEventModel.findById(id).exec();
    if (!event) {
      throw new NotFoundException('Run event not found');
    }
    if (!event.archive) {
      event.archive = true;
      await event.save();
    }
    return event.populate(RunEventsService.populateOptions);
  }

  async pauseRegistrations(id: string): Promise<RunEventDocument> {
    const event = await this.runEventModel.findById(id).exec();
    if (!event) {
      throw new NotFoundException('Run event not found');
    }
    if (event.status !== RunEventStatus.PUBLISHED) {
      throw new BadRequestException(
        'Only published events can pause registrations',
      );
    }
    if (event.isClosed) {
      throw new BadRequestException('Closed events cannot pause registrations');
    }
    if (event.registrationsPaused) {
      throw new BadRequestException('Registrations are already paused');
    }
    event.registrationsPaused = true;
    return (await event.save()).populate(RunEventsService.populateOptions);
  }

  async resumeRegistrations(id: string): Promise<RunEventDocument> {
    const event = await this.runEventModel.findById(id).exec();
    if (!event) {
      throw new NotFoundException('Run event not found');
    }
    if (event.status !== RunEventStatus.PUBLISHED) {
      throw new BadRequestException(
        'Only published events can resume registrations',
      );
    }
    if (event.isClosed) {
      throw new BadRequestException(
        'Closed events cannot resume registrations',
      );
    }
    if (!event.registrationsPaused) {
      throw new BadRequestException('Registrations are not paused');
    }
    event.registrationsPaused = false;
    return (await event.save()).populate(RunEventsService.populateOptions);
  }

  async remove(id: string): Promise<void> {
    const event = await this.runEventModel.findById(id).exec();
    if (!event) {
      throw new NotFoundException('Run event not found');
    }
    if (event.registeredCount > 0) {
      throw new BadRequestException(
        'Cannot delete event with registered participants',
      );
    }
    await this.runEventModel.findByIdAndDelete(id).exec();
  }

  async getRegistrationContext(id: string): Promise<RunEventDocument> {
    const event = await this.runEventModel
      .findById(id)
      .select(runEventRegistrationSelectFields)
      .exec();
    if (!event) {
      throw new NotFoundException('Run event not found');
    }
    if (event.status !== RunEventStatus.PUBLISHED || event.isClosed) {
      throw new BadRequestException('Run event is not open for registration');
    }
    if (event.registrationsPaused) {
      throw new BadRequestException('Registrations are paused for this event');
    }
    if (event.archive) {
      throw new BadRequestException('Run event is not open for registration');
    }
    return event;
  }

  async assertRegistration(id: string): Promise<RunEventDocument> {
    const event = await this.runEventModel.findById(id).exec();
    if (!event) {
      throw new NotFoundException('Run event not found');
    }
    if (event.status !== RunEventStatus.PUBLISHED || event.isClosed) {
      throw new BadRequestException('Run event is not open for registration');
    }
    if (event.registrationsPaused) {
      throw new BadRequestException('Registrations are paused for this event');
    }
    if (event.registeredCount >= event.maxParticipants) {
      throw new ConflictException('This event has reached maximum participants');
    }
    return event;
  }
}
