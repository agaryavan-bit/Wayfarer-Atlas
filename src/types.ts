export type TravelMode = 'WALKING' | 'DRIVING' | 'TRANSIT' | 'BICYCLING';
export type TravelPace = 'relaxed' | 'balanced' | 'intensive';
export type ActiveTab = 'planner' | 'lens' | 'lists' | 'journal' | 'fractions';

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface ItineraryStop {
  id: string;
  name: string;
  searchQuery: string;
  timeSlot: string;
  durationMinutes: number;
  category: string;
  description: string;
  visitingTips: string;
  estimatedCost: string;
  // Populated strictly from Google Maps Platform Places API (New)
  placeId?: string;
  formattedAddress?: string;
  lat?: number;
  lng?: number;
  rating?: number;
  googleMapsURI?: string;
}

export interface ItineraryDay {
  dayNumber: number;
  title: string;
  theme: string;
  stops: ItineraryStop[];
}

export interface Itinerary {
  id?: string;
  ownerId?: string;
  ownerName?: string;
  title: string;
  destination: string;
  startingPoint?: string;
  travelMode: TravelMode;
  pace: TravelPace;
  daysCount: number;
  summary: string;
  days: ItineraryDay[];
  sources: GroundingSource[];
  isPublic?: boolean;
  createdAt?: any;
  updatedAt?: any;
}

export interface RouteLegSummary {
  fromName: string;
  toName: string;
  distanceMeters: number;
  durationMillis: number;
  steps: Array<{
    instruction: string;
    distanceText: string;
  }>;
}

export interface ActiveRouteSummary {
  totalDistanceMeters: number;
  totalDurationMillis: number;
  legs: RouteLegSummary[];
}

export interface LandmarkResearchResult {
  overview: string;
  openingHours: string;
  ticketInfo: string;
  bestTime: string;
  nearbyRecommendations: string[];
  sources: GroundingSource[];
}

export interface ImageAnalysisResult {
  landmarkName: string;
  city: string;
  country: string;
  category: string;
  architecturalEra: string;
  confidence: string;
  historicalContext: string;
  visitingTips: string;
  recommendedDurationMinutes: number;
  mapsSearchQuery: string;
  highlights: string[];
}

export interface CollabList {
  id: string;
  ownerId: string;
  ownerName: string;
  title: string;
  destination: string;
  description: string;
  joinCode: string;
  visibility: 'shared' | 'private';
  createdAt?: any;
  updatedAt?: any;
}

export interface CollabListMember {
  id: string;
  userId: string;
  displayName: string;
  role: 'owner' | 'collaborator';
  listOwnerId: string;
  listVisibility: 'shared' | 'private';
  joinedAt?: any;
}

export interface CollabListItem {
  id: string;
  listId: string;
  listOwnerId: string;
  listVisibility: 'shared' | 'private';
  addedByUid: string;
  addedByName: string;
  placeName: string;
  address: string;
  placeId?: string;
  category: string;
  note: string;
  visited: boolean;
  votes: number;
  createdAt?: any;
  updatedAt?: any;
}

export interface TravelExperience {
  id: string;
  authorId: string;
  authorName: string;
  title: string;
  location: string;
  country: string;
  travelDate: string;
  summary: string;
  story: string;
  tips: string;
  imageUrl: string;
  tags: string[];
  likesCount: number;
  isPublished: boolean;
  isCuratedEditorial?: boolean;
  createdAt?: any;
  updatedAt?: any;
}

export interface ExperienceComment {
  id: string;
  experienceId: string;
  experiencePublished: boolean;
  authorId: string;
  authorName: string;
  body: string;
  createdAt?: any;
}
