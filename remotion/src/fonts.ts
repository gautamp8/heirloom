/** Heirloom typography. Three Google fonts loaded once at module
 *  import; each composition reads the resolved `fontFamily` below. */

import { loadFont as loadSerif } from "@remotion/google-fonts/SourceSerif4";
import { loadFont as loadSans } from "@remotion/google-fonts/Geist";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

const serif = loadSerif();
const sans = loadSans();
const mono = loadMono();

export const fontFamilies = {
  serif: serif.fontFamily,
  sans: sans.fontFamily,
  mono: mono.fontFamily,
};
