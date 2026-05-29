import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { PaginatedResult } from '../core/interfaces/common';
import { CreateRunEventDto, UpdateRunEventDto } from './dto/run-events.dto';
import {
  IRunEvent,
  IRunEventLocation,
  IRunEventLocationInput,
  RunEventStatus,
} from './interfaces/run-event.interface';
import {
  RunEvent,
  RunEventDocument,
  RunEventLocation,
} from './schemas/run-event.schema';

@Injectable()
export class RunEventsService {
  constructor(
    @InjectModel(RunEvent.name) private runEventModel: Model<RunEvent>,
  ) {}

  async create(
    dto: CreateRunEventDto,
    createdBy: string,
  ): Promise<RunEventDocument> {
    const slug = await this.generateUniqueSlug(dto.title);
    this.validateCustomQuestionKeys(
      dto.customQuestions?.map((q) => q.key) ?? [],
    );

    const event = new this.runEventModel({
      ...dto,
      location: this.buildLocation(dto.location),
      slug,
      createdBy,
      status: RunEventStatus.DRAFT,
    });

    return event.save();
  }

  async findAll(
    status?: RunEventStatus,
    page = 1,
    limit = 10,
    lat?: number,
    long?: number,
    maxDistanceMeters?: number,
  ): Promise<PaginatedResult<IRunEvent>> {
    const filter: Record<string, unknown> = {};
    if (status) {
      filter.status = status;
    }

    if (lat !== undefined && long !== undefined) {
      return this.findAllByDistance(
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
        .exec(),
      this.runEventModel.countDocuments(filter).exec(),
    ]);

    return {
      data: events.map((event) => this.toResponse(event)),
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
  ): Promise<PaginatedResult<IRunEvent>> {
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
    const event = await this.runEventModel.findById(id).exec();
    if (!event) {
      throw new NotFoundException('Run event not found');
    }
    return event;
  }

  async findPublishedBySlug(slug: string): Promise<RunEventDocument> {
    const event = await this.runEventModel
      .findOne({ slug: slug.toLowerCase(), status: RunEventStatus.PUBLISHED })
      .exec();

    if (!event) {
      throw new NotFoundException('Run event not found');
    }

    return event;
  }

  async update(id: string, dto: UpdateRunEventDto): Promise<RunEventDocument> {
    const event = await this.findById(id);

    if (dto.customQuestions) {
      this.validateCustomQuestionKeys(dto.customQuestions.map((q) => q.key));
    }

    if (dto.title && dto.title !== event.title) {
      event.slug = await this.generateUniqueSlug(dto.title, id);
    }

    const { location, ...rest } = dto;
    Object.assign(event, rest);

    if (location) {
      event.location = this.buildLocation(location);
      event.markModified('location');
    }

    return event.save();
  }

  async publish(id: string): Promise<RunEventDocument> {
    const event = await this.findById(id);
    event.status = RunEventStatus.PUBLISHED;
    return event.save();
  }

  async close(id: string): Promise<RunEventDocument> {
    const event = await this.findById(id);
    event.status = RunEventStatus.CLOSED;
    return event.save();
  }

  async remove(id: string): Promise<void> {
    const result = await this.runEventModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException('Run event not found');
    }
  }

  async assertPublished(id: string): Promise<RunEventDocument> {
    const event = await this.findById(id);
    if (event.status !== RunEventStatus.PUBLISHED) {
      throw new BadRequestException('Run event is not open for registration');
    }
    return event;
  }

  toResponse(
    event: RunEventDocument | RunEvent,
    distanceMeters?: number,
  ): IRunEvent {
    return {
      _id: event._id.toString(),
      title: event.title,
      slug: event.slug,
      coverImages: event.coverImages ?? [],
      description: event.description,
      eventDate: event.eventDate,
      reportingTime: event.reportingTime,
      location: this.toLocationResponse(event.location),
      price: event.price,
      currency: event.currency,
      inclusions: event.inclusions ?? [],
      guidelines: event.guidelines ?? [],
      customQuestions: event.customQuestions ?? [],
      status: event.status,
      createdBy: event.createdBy.toString(),
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
      ...(distanceMeters !== undefined ? { distanceMeters } : {}),
    };
  }

  private buildLocation(input: IRunEventLocationInput): RunEventLocation {
    return {
      city: input.city,
      state: input.state,
      address: input.address,
      geo: {
        type: 'Point',
        coordinates: [input.long, input.lat],
      },
    };
  }

  private toLocationResponse(location: RunEventLocation): IRunEventLocation {
    const [long, lat] = location.geo.coordinates;
    return {
      city: location.city,
      state: location.state,
      address: location.address,
      lat,
      long,
      geo: location.geo,
    };
  }

  private async findAllByDistance(
    filter: Record<string, unknown>,
    lat: number,
    long: number,
    page: number,
    limit: number,
    maxDistanceMeters?: number,
  ): Promise<PaginatedResult<IRunEvent>> {
    const skip = (page - 1) * limit;

    const geoNearStage = {
      near: { type: 'Point' as const, coordinates: [long, lat] as [number, number] },
      distanceField: 'distanceMeters',
      spherical: true,
      key: 'location.geo',
      query: filter,
      ...(maxDistanceMeters !== undefined
        ? { maxDistance: maxDistanceMeters }
        : {}),
    };

    const [result] = await this.runEventModel
      .aggregate<{
        data: Array<RunEvent & { distanceMeters: number }>;
        total: Array<{ count: number }>;
      }>([
        { $geoNear: geoNearStage },
        {
          $facet: {
            data: [{ $skip: skip }, { $limit: limit }],
            total: [{ $count: 'count' }],
          },
        },
      ])
      .exec();

    const total = result?.total[0]?.count ?? 0;

    return {
      data: (result?.data ?? []).map((event) =>
        this.toResponse(event, event.distanceMeters),
      ),
      totalDocuments: total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  private validateCustomQuestionKeys(keys: string[]): void {
    const uniqueKeys = new Set(keys);
    if (uniqueKeys.size !== keys.length) {
      throw new BadRequestException('Custom question keys must be unique');
    }
  }

  private slugify(title: string): string {
    return title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private async generateUniqueSlug(
    title: string,
    excludeId?: string,
  ): Promise<string> {
    const baseSlug = this.slugify(title) || 'run-event';
    let slug = baseSlug;
    let counter = 1;

    while (true) {
      const filter: Record<string, unknown> = { slug };
      if (excludeId) {
        filter._id = { $ne: excludeId };
      }

      const existing = await this.runEventModel.findOne(filter).exec();
      if (!existing) {
        return slug;
      }

      slug = `${baseSlug}-${counter}`;
      counter++;
    }
  }
}
