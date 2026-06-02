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
import { CreateRunEventDto, UpdateRunEventDto } from './dto/run-events.dto';
import {
  PublicRunEventSegment,
  RunEventStatus,
} from './interfaces/run-event.interface';
import {
  RunEvent,
  RunEventDocument,
} from './schemas/run-event.schema';
import { RunEventsRegistrationUtility } from './utility/run-events-registration.utility';
import { RunEventsUtility } from './utility/run-events.utility';

function startOfTodayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

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
    status?: RunEventStatus,
    page = 1,
    limit = 10,
    lat?: number,
    long?: number,
    maxDistanceMeters?: number,
    isClosed?: boolean,
    archive?: boolean,
  ): Promise<PaginatedResult<RunEventDocument>> {
    const filter: Record<string, unknown> = {};
    if (status) {
      filter.status = status;
    }
    if (isClosed !== undefined) {
      filter.isClosed = isClosed;
    }
    if (archive !== undefined) {
      filter.archive = archive;
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

  private buildPublicFilter(segment: PublicRunEventSegment): Record<string, unknown> {
    const filter: Record<string, unknown> = {
      status: RunEventStatus.PUBLISHED,
      archive: false,
    };

    if (segment === 'upcoming') {
      filter.isClosed = false;
      filter.eventDate = { $gte: startOfTodayUtc() };
    } else {
      filter.isClosed = true;
    }

    return filter;
  }

  private sortForPublicSegment(segment: PublicRunEventSegment): Record<string, 1 | -1> {
    if (segment === 'upcoming') {
      return { eventDate: 1 };
    }
    return { closedAt: -1, eventDate: -1 };
  }

  async findPublic(
    segment: PublicRunEventSegment = 'upcoming',
    page = 1,
    limit = 10,
    lat?: number,
    long?: number,
    maxDistanceMeters?: number,
  ): Promise<PaginatedResult<RunEventDocument>> {
    const filter = this.buildPublicFilter(segment);
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
