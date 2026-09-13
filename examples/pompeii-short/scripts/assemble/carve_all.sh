#!/usr/bin/env bash
# Voiceover carve for every bed that plays under the narration (/hyperframes-audio → carve.mjs):
# the drone and the SFX get dynamic dips in the bands the voice occupies plus a level envelope that
# follows the speech. Voices share the `voiceover` bus, so each carve records the group, not clip ids.
# The finale thud is not carved: it sits in the silence before the last line, with no voice over it.
# Scene-change thuds carve harder (0.75): their tails overlap the first syllable of each line.
set -euo pipefail
cd "$(dirname "$0")/../.."

CARVE="${CARVE:-../.agents/skills/hyperframes-audio/scripts/carve.mjs}"
[ -f "$CARVE" ] || CARVE="/home/ct/Desktop/hygen/.agents/skills/hyperframes-audio/scripts/carve.mjs"

ALL_VOICES=(--voice el-01-hook-voice --voice el-02-context-voice --voice el-03-eruption-voice
            --voice el-04-collapse-voice --voice el-05-return-voice --voice el-06-finale-voice)

node "$CARVE" --comp index.html --bed music-drone "${ALL_VOICES[@]}" --strength 0.65
node "$CARVE" --comp index.html --bed sfx-ash-fall-03 --voice el-03-eruption-voice --voice el-04-collapse-voice --strength 0.6
for pair in sfx-thud-02:el-02-context-voice sfx-thud-03:el-03-eruption-voice \
            sfx-thud-heavy-04:el-04-collapse-voice sfx-thud-05:el-05-return-voice; do
  node "$CARVE" --comp index.html --bed "${pair%%:*}" --voice "${pair#*:}" --strength 0.75
done
