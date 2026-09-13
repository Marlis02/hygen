// Trimmed copy of media-use/audio/scripts/lib/bgm.mjs (skill heygen-com/hyperframes, 0.8.36).
// assemble-index.mjs imports only bgmDefaultVolume; the full file pulls the HeyGen client and
// Python/MusicGen probes, which the engine does not use. Values are identical to the original.
export const BGM_BED_VOLUME = 0.12;
export const BGM_SILENT_VOLUME = 0.9;
export const bgmDefaultVolume = (hasVoice) => (hasVoice ? BGM_BED_VOLUME : BGM_SILENT_VOLUME);
