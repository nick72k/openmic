/** Anything the mute controls can silence. */
export interface Mutable {
  mute(): void;
  unmute(): void;
}
