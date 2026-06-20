import { Controller, Get, Query } from '@nestjs/common';
import {
  PlacesAutocompleteQueryDto,
  PlacesDetailsQueryDto,
} from './dto/places.dto';
import { PlacesService } from './places.service';

@Controller('places')
export class PlacesController {
  constructor(private readonly placesService: PlacesService) {}

  @Get('autocomplete')
  async autocomplete(@Query() query: PlacesAutocompleteQueryDto) {
    return this.placesService.autocomplete(
      query.input,
      query.countries ?? ['in'],
      query.language ?? 'en',
    );
  }

  @Get('details')
  async details(@Query() query: PlacesDetailsQueryDto) {
    return this.placesService.details(query.placeId, query.language ?? 'en');
  }
}
