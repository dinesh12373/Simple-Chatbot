/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const colors = {
  light: {
    text: '#1D2924',
    tint: '#276749',
    background: '#F5F6F1',
    foreground: '#1D2924',
    card: '#FFFFFF',
    cardForeground: '#1D2924',
    primary: '#276749',
    primaryForeground: '#FAFFF9',
    secondary: '#E8ECE5',
    secondaryForeground: '#31423A',
    muted: '#ECF0EA',
    mutedForeground: '#758079',
    accent: '#E2F2E8',
    accentForeground: '#24533A',
    destructive: '#B9483F',
    destructiveForeground: '#FFFFFF',
    border: '#DEE5DD',
    input: '#DCE3DB',
  },
  dark: {
    text: '#EAF0EB',
    tint: '#95D5A9',
    background: '#101713',
    foreground: '#EAF0EB',
    card: '#18221C',
    cardForeground: '#EAF0EB',
    primary: '#95D5A9',
    primaryForeground: '#102419',
    secondary: '#222F27',
    secondaryForeground: '#DEE8E0',
    muted: '#1D2922',
    mutedForeground: '#A1AEA5',
    accent: '#263B2E',
    accentForeground: '#B3E5C2',
    destructive: '#F18C82',
    destructiveForeground: '#31120F',
    border: '#2D3A31',
    input: '#36453A',
  },
  radius: 18,
};

export default colors;
