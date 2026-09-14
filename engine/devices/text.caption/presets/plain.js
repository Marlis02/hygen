/* plain — own: the words of the group as they are, no motion of their own. Background, active word and entrance come
   from the shared fields (look.captions ← video.json captions ← beat caption); the default is no background, no line. */
HygenCaptions.define("plain", {
  family: "calm",
  origin: "own",
  owns: { background: false, active: false, entrance: false },
  mount: function (api) {
    api.words(api.box);
  }
});
