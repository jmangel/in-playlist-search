import Dexie, { Table } from 'dexie';

export interface Playlist {
  id: string;
  uri: string;
  spotifyUrl: string;
  owner: {
    id: string;
    display_name: string;
  };
}

export interface PlaylistSnapshot {
  id: string;
  playlistId: string;
  name: string;
  description: string;
  rememberedAt: Date;
  totalTracks: number;
  trackIds: string[];
}

export interface Artist {
  id: string;
  name: string;
}

export interface Track {
  id: string;
  name: string;
  albumName: string;
  artistIds: string[];
  uri: string;
}

export class PlaylistDatabase extends Dexie {
  playlists!: Table<Playlist>;
  playlistSnapshots!: Table<PlaylistSnapshot>;
  tracks!: Table<Track>;
  artists!: Table<Artist>;

  constructor() {
    super('PlaylistDatabase');
    this.version(2).stores({
      playlists: 'id',
      playlistSnapshots: 'id',
      tracks: 'id',
      artists: 'id',
    });
  }
}

export const playlistDatabase = new PlaylistDatabase();
