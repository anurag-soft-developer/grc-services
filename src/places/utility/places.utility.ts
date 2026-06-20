interface GoogleAutocompleteTerm {
  value?: string;
}

interface GoogleStructuredFormatting {
  main_text?: string;
  secondary_text?: string;
}

interface GoogleAddressComponent {
  long_name?: string;
  short_name?: string;
  types?: string[];
}

export interface GoogleAutocompletePrediction {
  place_id?: string;
  description?: string;
  structured_formatting?: GoogleStructuredFormatting;
  terms?: GoogleAutocompleteTerm[];
}

export interface GooglePlaceDetailsResult {
  place_id?: string;
  formatted_address?: string;
  geometry?: {
    location?: {
      lat?: number;
      lng?: number;
    };
  };
  address_components?: GoogleAddressComponent[];
}

export interface PlacePredictionResponse {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText?: string;
}

export interface PlaceDetailsResponse {
  placeId: string;
  address: string;
  city: string;
  state: string;
  lat?: number;
  long?: number;
}

export class PlacesUtility {
  static mapAutocompletePrediction(
    prediction: GoogleAutocompletePrediction,
  ): PlacePredictionResponse | null {
    const placeId = prediction.place_id?.trim();
    const description = prediction.description?.trim();
    if (!placeId || !description) {
      return null;
    }

    const mainText =
      prediction.structured_formatting?.main_text?.trim() || description;
    const secondaryText =
      prediction.structured_formatting?.secondary_text?.trim();

    return {
      placeId,
      description,
      mainText,
      ...(secondaryText ? { secondaryText } : {}),
    };
  }

  static mapPlaceDetails(
    result: GooglePlaceDetailsResult,
  ): PlaceDetailsResponse | null {
    const placeId = result.place_id?.trim();
    const address = result.formatted_address?.trim();
    if (!placeId || !address) {
      return null;
    }

    const lat = result.geometry?.location?.lat;
    const long = result.geometry?.location?.lng;
    const parsed = PlacesUtility.parseAddressComponents(
      result.address_components ?? [],
    );

    return {
      placeId,
      address,
      city: parsed.city,
      state: parsed.state,
      ...(typeof lat === 'number' ? { lat } : {}),
      ...(typeof long === 'number' ? { long } : {}),
    };
  }

  static parseTerms(
    terms: GoogleAutocompleteTerm[] | undefined,
    secondaryText?: string,
  ): { city: string; state: string } {
    if (terms && terms.length > 0) {
      const values = terms
        .map((term) => term.value?.trim() ?? '')
        .filter((value) => value.length > 0);

      if (values.length >= 3) {
        return {
          city: values[values.length - 3],
          state: values[values.length - 2],
        };
      }

      if (values.length === 2) {
        return {
          city: values[0],
          state: values[1],
        };
      }
    }

    return PlacesUtility.parseSecondaryText(secondaryText);
  }

  private static parseAddressComponents(
    components: GoogleAddressComponent[],
  ): { city: string; state: string } {
    const findComponent = (...types: string[]) =>
      components.find((component) =>
        types.some((type) => component.types?.includes(type)),
      );

    const city =
      findComponent('locality', 'postal_town', 'administrative_area_level_2')
        ?.long_name?.trim() ?? '';
    const state =
      findComponent('administrative_area_level_1')?.long_name?.trim() ?? '';

    return { city, state };
  }

  static parseSecondaryTextFromAddress(address?: string): {
    city: string;
    state: string;
  } {
    if (!address?.trim()) {
      return { city: '', state: '' };
    }

    const parts = address
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length >= 3) {
      return {
        city: parts[parts.length - 3],
        state: parts[parts.length - 2],
      };
    }

    if (parts.length === 2) {
      return {
        city: parts[0],
        state: parts[1],
      };
    }

    return { city: '', state: '' };
  }

  private static parseSecondaryText(secondaryText?: string): {
    city: string;
    state: string;
  } {
    if (!secondaryText?.trim()) {
      return { city: '', state: '' };
    }

    const parts = secondaryText
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length >= 3) {
      return {
        city: parts[parts.length - 3],
        state: parts[parts.length - 2],
      };
    }

    if (parts.length === 2) {
      return {
        city: parts[0],
        state: parts[1],
      };
    }

    return { city: '', state: '' };
  }
}
