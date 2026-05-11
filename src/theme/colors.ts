/**
 * Semantic color tokens used across the app.
 *
 * Use these names by meaning ("danger", "success"), not by hue ("red", "green").
 * That way, swapping the palette later only touches this file.
 */
export const Colors = {
    // Brand
    primary: '#1E40AF',          // Deep blue — primary actions, headers
    primaryDark: '#1E3A8A',      // Pressed / emphasized state
    primaryLight: '#3B82F6',     // Lighter accents
  
    // Status
    success: '#16A34A',          // Inventory safe, eligibility passed
    warning: '#F59E0B',          // Expiring soon, temperature borderline
    danger: '#DC2626',           // Offline, expired, eligibility failed
    info: '#0EA5E9',             // Neutral informational accents
  
    // Surfaces
    background: '#F5F7FB',       // App background
    surface: '#FFFFFF',          // Cards, panels
    surfaceMuted: '#F1F5F9',     // Subtle inset surfaces
  
    // Text
    text: '#0F1728',             // Primary text
    textSecondary: '#475467',    // Secondary text
    textMuted: '#98A2B3',        // Captions, disabled labels
    textInverse: '#FFFFFF',      // Text on dark backgrounds
  
    // Borders / dividers
    border: '#E6EAF0',
    borderStrong: '#CBD5E1',
  
    // Overlays
    overlayLight: 'rgba(255,255,255,0.72)',
    overlayDark: 'rgba(6, 14, 28, 0.42)',
  } as const;
  
  export type ColorToken = keyof typeof Colors;