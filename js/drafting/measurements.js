/* ============================================================
   Thread & Template — Measurement System
   Loads RTW datasets and manages Bespoke custom inputs
   ============================================================ */

import { MEASURE_MODE } from '../constants.js';

let _rtwData = null;

/**
 * Load RTW measurement data from JSON.
 * Must be called before using getMeasurementSet.
 */
export async function loadMeasurements() {
  if (_rtwData) return _rtwData;

  try {
    const resp = await fetch('./data/measurements-rtw.json');
    _rtwData = await resp.json();
    return _rtwData;
  } catch (err) {
    console.error('Failed to load RTW measurements:', err);
    return null;
  }
}

/**
 * Get available size names.
 * @returns {string[]}
 */
export function getAvailableSizes() {
  if (!_rtwData) return [];
  return Object.keys(_rtwData.sizes);
}

/**
 * Get a measurement set for a given size.
 * @param {string} size - e.g., 'M', 'L'
 * @returns {object|null} Measurement values
 */
export function getMeasurementSet(size) {
  if (!_rtwData || !_rtwData.sizes[size]) return null;
  return { ...(_rtwData.sizes[size]) };
}

/**
 * Get a project template by ID.
 * @param {string} projectId - e.g., 'apron', 'lined-skirt'
 * @returns {object|null}
 */
export function getProjectTemplate(projectId) {
  if (!_rtwData || !_rtwData.projectTemplates[projectId]) return null;
  return _rtwData.projectTemplates[projectId];
}

/**
 * Get all available project template IDs.
 * @returns {string[]}
 */
export function getAvailableProjects() {
  if (!_rtwData) return [];
  return Object.keys(_rtwData.projectTemplates);
}

/**
 * Get the measurement unit string.
 * @returns {string}
 */
export function getUnits() {
  return _rtwData ? _rtwData.units : 'inches';
}

/**
 * Create a blank bespoke measurement set with all keys zeroed.
 * @returns {object}
 */
export function createBlankMeasurements() {
  if (!_rtwData || !_rtwData.sizes) return {};

  // Use first size as template for keys
  const firstSize = Object.values(_rtwData.sizes)[0];
  const blank = {};
  for (const key of Object.keys(firstSize)) {
    blank[key] = 0;
  }
  return blank;
}

/**
 * Validate that a measurement set has all required measurements for a project.
 * @param {object} measurements
 * @param {object} template - Project template
 * @returns {{ valid: boolean, missing: string[] }}
 */
export function validateMeasurements(measurements, template) {
  const missing = [];
  for (const key of template.requiredMeasurements) {
    if (!measurements[key] || measurements[key] <= 0) {
      missing.push(key);
    }
  }
  return { valid: missing.length === 0, missing };
}
