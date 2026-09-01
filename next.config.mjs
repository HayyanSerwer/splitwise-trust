/** @type {import('next').NextConfig} */
export default {
  // A stray lockfile in the home directory makes Next guess the wrong workspace
  // root; pin it to this project.
  outputFileTracingRoot: import.meta.dirname,
};
