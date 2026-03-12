/**
 * Project file loading and validation.
 * Handles project.json load/save/validate for both editor and player.
 */

const REQUIRED_FIELDS = ['clips', 'beatMap'];
const REQUIRED_CLIP_FIELDS = ['id', 'effect', 'start', 'end'];

export async function loadProject(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load project: ${response.status} ${response.statusText}`);
  }
  const data = await response.json();
  const errors = validateProject(data);
  if (errors.length > 0) {
    throw new Error(`Invalid project:\n${errors.join('\n')}`);
  }
  return data;
}

export function validateProject(data) {
  const errors = [];

  if (!data || typeof data !== 'object') {
    return ['Project must be a JSON object'];
  }

  for (const field of REQUIRED_FIELDS) {
    if (!(field in data)) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  if (Array.isArray(data.clips)) {
    data.clips.forEach((clip, i) => {
      for (const field of REQUIRED_CLIP_FIELDS) {
        if (!(field in clip)) {
          errors.push(`Clip ${i}: missing required field "${field}"`);
        }
      }
      if (typeof clip.start === 'number' && typeof clip.end === 'number') {
        if (clip.end <= clip.start) {
          errors.push(`Clip ${i} ("${clip.id}"): end must be greater than start`);
        }
      }
    });
  } else if ('clips' in data) {
    errors.push('clips must be an array');
  }

  if (data.beatMap && typeof data.beatMap === 'object') {
    if (!Array.isArray(data.beatMap.beats)) {
      errors.push('beatMap.beats must be an array');
    }
    if (!Array.isArray(data.beatMap.bars)) {
      errors.push('beatMap.bars must be an array');
    }
  }

  return errors;
}

export function resolveProject() {
  const params = new URLSearchParams(location.search);

  if (params.has('project')) {
    return loadProject(params.get('project'));
  }

  if (window.__DEMO_PROJECT__) {
    const errors = validateProject(window.__DEMO_PROJECT__);
    if (errors.length > 0) {
      return Promise.reject(new Error(`Invalid inline project:\n${errors.join('\n')}`));
    }
    return Promise.resolve(window.__DEMO_PROJECT__);
  }

  return loadProject('../assets/project.json');
}
