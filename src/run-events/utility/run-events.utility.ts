import { BadRequestException } from '@nestjs/common';
import { Model, PopulateOptions } from 'mongoose';
import type { PaginatedResult } from '../../core/interfaces/common';
import { buildPaginatedResult } from '../../core/utils/pagination.util';
import { IRunEventLocationInput } from '../interfaces/run-event.interface';
import {
  RunEvent,
  RunEventDocument,
  RunEventLocation,
} from '../schemas/run-event.schema';

export class RunEventsUtility {
  static buildLocation(input: IRunEventLocationInput): RunEventLocation {
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

  static validateCustomQuestionKeys(keys: string[]): void {
    const uniqueKeys = new Set(keys);
    if (uniqueKeys.size !== keys.length) {
      throw new BadRequestException('Custom question keys must be unique');
    }
  }

  static slugify(title: string): string {
    return title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  static async generateUniqueSlug(
    runEventModel: Model<RunEvent>,
    title: string,
    excludeId?: string,
  ): Promise<string> {
    const baseSlug = RunEventsUtility.slugify(title) || 'run-event';
    let slug = baseSlug;
    let counter = 1;

    while (true) {
      const filter: Record<string, unknown> = { slug };
      if (excludeId) {
        filter._id = { $ne: excludeId };
      }

      const existing = await runEventModel.findOne(filter).exec();
      if (!existing) {
        return slug;
      }

      slug = `${baseSlug}-${counter}`;
      counter++;
    }
  }

  static async findAllByDistance(
    runEventModel: Model<RunEvent>,
    populateOptions: PopulateOptions[],
    filter: Record<string, unknown>,
    lat: number,
    long: number,
    page: number,
    limit: number,
    maxDistanceMeters?: number,
    sort: Record<string, 1 | -1> = { createdAt: -1 },
  ): Promise<PaginatedResult<RunEventDocument>> {
    const skip = (page - 1) * limit;

    const geoNearStage = {
      near: {
        type: 'Point' as const,
        coordinates: [long, lat] as [number, number],
      },
      distanceField: 'distanceMeters',
      spherical: true,
      key: 'location.geo',
      query: filter,
      ...(maxDistanceMeters !== undefined
        ? { maxDistance: maxDistanceMeters }
        : {}),
    };

    const [result] = await runEventModel
      .aggregate<{
        data: Array<RunEvent & { distanceMeters: number }>;
        total: Array<{ count: number }>;
      }>([
        { $geoNear: geoNearStage },
        {
          $addFields: {
            'location.lat': { $arrayElemAt: ['$location.geo.coordinates', 1] },
            'location.long': { $arrayElemAt: ['$location.geo.coordinates', 0] },
          },
        },
        { $sort: sort },
        {
          $facet: {
            data: [{ $skip: skip }, { $limit: limit }],
            total: [{ $count: 'count' }],
          },
        },
      ])
      .exec();

    const total = result?.total[0]?.count ?? 0;
    const data = await runEventModel.populate(
      result?.data ?? [],
      populateOptions,
    );

    return buildPaginatedResult(data, total, page, limit);
  }
}
