# In-Playlist Search

Search all your saved Spotify playlists for the ones that match the mood, by searching for the song in your head.

[It's live](https://in-playlist-search.onrender.com/ 'In-Playlist Search').
(If your spotify account is denied access, email me with your spotify email address so I can add you to the list of beta users.)

## Features

### This README needs help, but basically this app does some of this cool stuff, and probably some others I forgot:

- Spotify integration with authorization via PKCE
- fuzzy-ish search by song, artist, album, or playlist name, description, or owner
- controls to play the song in the playlist straight from the results, to any active device
- controls to create a copy of a playlist
- queue preview to see what songs will be up next after the match
- caching with local IndexedDb (every visit after the first will be much faster)
- progressive search while the full set of playlists and songs continues loading
