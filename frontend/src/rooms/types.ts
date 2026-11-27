export interface Room {
  id: string;
  canonicalId?: string;
  alias?: string;
  name: string;
  description?: string;
  isPrivate: boolean;
  onlineCount?: number;
  totalMessages?: number;
}

export interface RoomsStateSnapshot {
  rooms: Room[];
  page: number;
  hasMore: boolean;
  searchQuery: string;
  scrollY?: number;
}
