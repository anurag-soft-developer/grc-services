import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PopulateOptions } from 'mongoose';
import type { PaginatedResult } from '../core/interfaces/common';
import { userSelectFields } from '../users/schemas/user.schema';
import { CreateRunEventDto, UpdateRunEventDto } from './dto/run-events.dto';
import { RunEventStatus } from './interfaces/run-event.interface';
import {
  RunEvent,
  RunEventDocument,
} from './schemas/run-event.schema';
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
  ): Promise<PaginatedResult<RunEventDocument>> {
    const filter: Record<string, unknown> = {};
    if (status) {
      filter.status = status;
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

    return {
      data: events,
      totalDocuments: total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async findPublished(
    page = 1,
    limit = 10,
    lat?: number,
    long?: number,
    maxDistanceMeters?: number,
  ): Promise<PaginatedResult<RunEventDocument>> {
    return this.findAll(
      RunEventStatus.PUBLISHED,
      page,
      limit,
      lat,
      long,
      maxDistanceMeters,
    );
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

  async findPublishedBySlug(slug: string): Promise<RunEventDocument> {
    const event = await this.runEventModel
      .findOne({ slug: slug.toLowerCase(), status: RunEventStatus.PUBLISHED })
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
    return (await event.save()).populate(RunEventsService.populateOptions);
  }

  async close(id: string): Promise<RunEventDocument> {
    const event = await this.runEventModel.findById(id).exec();
    if (!event) {
      throw new NotFoundException('Run event not found');
    }
    event.status = RunEventStatus.CLOSED;
    return (await event.save()).populate(RunEventsService.populateOptions);
  }

  async remove(id: string): Promise<void> {
    const result = await this.runEventModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException('Run event not found');
    }
  }

  async assertPublished(id: string): Promise<RunEventDocument> {
    const event = await this.runEventModel.findById(id).exec();
    if (!event) {
      throw new NotFoundException('Run event not found');
    }
    if (event.status !== RunEventStatus.PUBLISHED) {
      throw new BadRequestException('Run event is not open for registration');
    }
    return event;
  }
}
