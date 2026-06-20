import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { config } from '../core/config/env.config';
import {
  GoogleAutocompletePrediction,
  GooglePlaceDetailsResult,
  PlaceDetailsResponse,
  PlacePredictionResponse,
  PlacesUtility,
} from './utility/places.utility';

interface GoogleAutocompleteResponse {
  status?: string;
  error_message?: string;
  predictions?: GoogleAutocompletePrediction[];
}

interface GooglePlaceDetailsResponse {
  status?: string;
  error_message?: string;
  result?: GooglePlaceDetailsResult;
}

@Injectable()
export class PlacesService {
  private static readonly AUTOCOMPLETE_URL =
    'https://maps.googleapis.com/maps/api/place/autocomplete/json';
  private static readonly DETAILS_URL =
    'https://maps.googleapis.com/maps/api/place/details/json';

  async autocomplete(
    input: string,
    countries: string[],
    language: string,
  ): Promise<{ predictions: PlacePredictionResponse[] }> {
    const url = new URL(PlacesService.AUTOCOMPLETE_URL);
    url.searchParams.set('input', input);
    url.searchParams.set('key', config.GOOGLE_PLACES_API_KEY);
    url.searchParams.set('language', language);

    if (countries.length > 0) {
      url.searchParams.set(
        'components',
        countries.map((country) => `country:${country}`).join('|'),
      );
    }

    const payload = await this.fetchGoogleJson<GoogleAutocompleteResponse>(url);
    this.assertGoogleStatus(payload.status, payload.error_message);

    const predictions = (payload.predictions ?? [])
      .map((prediction) => PlacesUtility.mapAutocompletePrediction(prediction))
      .filter(
        (prediction): prediction is PlacePredictionResponse =>
          prediction !== null,
      );

    return { predictions };
  }

  async details(
    placeId: string,
    language: string,
  ): Promise<PlaceDetailsResponse> {
    const url = new URL(PlacesService.DETAILS_URL);
    url.searchParams.set('placeid', placeId);
    url.searchParams.set('key', config.GOOGLE_PLACES_API_KEY);
    url.searchParams.set('language', language);
    url.searchParams.set(
      'fields',
      'place_id,formatted_address,geometry,address_components',
    );

    const payload = await this.fetchGoogleJson<GooglePlaceDetailsResponse>(url);
    this.assertGoogleStatus(payload.status, payload.error_message);

    if (!payload.result) {
      throw new BadRequestException('Place details not found');
    }

    const mapped = PlacesUtility.mapPlaceDetails(payload.result);
    if (!mapped) {
      throw new BadRequestException('Place details could not be parsed');
    }

    if (!mapped.city || !mapped.state) {
      const parsed = PlacesUtility.parseSecondaryTextFromAddress(
        payload.result.formatted_address,
      );
      return {
        ...mapped,
        city: mapped.city || parsed.city,
        state: mapped.state || parsed.state,
      };
    }

    return mapped;
  }

  private async fetchGoogleJson<T>(url: URL): Promise<T> {
    let response: Response;

    try {
      response = await fetch(url);
    } catch {
      throw new BadGatewayException('Failed to reach Google Places API');
    }

    if (!response.ok) {
      throw new BadGatewayException('Google Places API request failed');
    }

    return (await response.json()) as T;
  }

  private assertGoogleStatus(status?: string, errorMessage?: string): void {
    if (status === 'OK' || status === 'ZERO_RESULTS') {
      return;
    }

    throw new BadRequestException(
      errorMessage || status || 'Google Places API request failed',
    );
  }
}
