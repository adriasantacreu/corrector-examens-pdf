#!/usr/bin/env node

/**
 * JavaScript Data Structures Benchmark
 * Compare performance of different data structures and operations
 *
 * Usage:
 *   node benchmark-data-structures.js
 *   node benchmark-data-structures.js --size 10000
 *   node benchmark-data-structures.js --type array
 *
 * @author Dr. Umit Kacar & Muhsin Elcicek
 * @version 1.0.0
 */

// Configuration
const DEFAULT_SIZE = 10000;
const ITERATIONS = 100;

// Colors
const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m'
};

/**
 * Measure execution time of a function
 */
function benchmark(name, fn, iterations = ITERATIONS) {
  // Warmup
  for (let i = 0; i < 10; i++) fn();

  const times = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }

  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);

  return { name, avg, min, max, iterations };
}

/**
 * Format benchmark result
 */
function formatResult(result) {
  return `${result.name.padEnd(40)} Avg: ${result.avg.toFixed(3).padStart(8)}ms | Min: ${result.min.toFixed(3).padStart(8)}ms | Max: ${result.max.toFixed(3).padStart(8)}ms`;
}

/**
 * Array Benchmarks
 */
function runArrayBenchmarks(size) {
  console.log(`\n${COLORS.cyan}═══════════════════════════════════════════════════════════${COLORS.reset}`);
  console.log(`${COLORS.cyan}  ARRAY BENCHMARKS (size: ${size})${COLORS.reset}`);
  console.log(`${COLORS.cyan}═══════════════════════════════════════════════════════════${COLORS.reset}\n`);

  const arr = Array.from({ length: size }, (_, i) => i);

  const results = [];

  // Push vs Unshift
  results.push(benchmark('push (add to end)', () => {
    const a = [];
    for (let i = 0; i < 1000; i++) a.push(i);
  }));

  results.push(benchmark('unshift (add to start)', () => {
    const a = [];
    for (let i = 0; i < 1000; i++) a.unshift(i);
  }));

  // Pop vs Shift
  results.push(benchmark('pop (remove from end)', () => {
    const a = [...arr.slice(0, 1000)];
    while (a.length) a.pop();
  }));

  results.push(benchmark('shift (remove from start)', () => {
    const a = [...arr.slice(0, 1000)];
    while (a.length) a.shift();
  }));

  // Access patterns
  results.push(benchmark('direct index access', () => {
    let sum = 0;
    for (let i = 0; i < arr.length; i++) sum += arr[i];
  }));

  results.push(benchmark('for...of iteration', () => {
    let sum = 0;
    for (const item of arr) sum += item;
  }));

  results.push(benchmark('forEach', () => {
    let sum = 0;
    arr.forEach(x => sum += x);
  }));

  results.push(benchmark('reduce', () => {
    arr.reduce((acc, x) => acc + x, 0);
  }));

  // Search operations
  results.push(benchmark('indexOf (first element)', () => {
    arr.indexOf(0);
  }));

  results.push(benchmark('indexOf (last element)', () => {
    arr.indexOf(size - 1);
  }));

  results.push(benchmark('includes (first element)', () => {
    arr.includes(0);
  }));

  results.push(benchmark('includes (last element)', () => {
    arr.includes(size - 1);
  }));

  results.push(benchmark('find (first match)', () => {
    arr.find(x => x === 0);
  }));

  results.push(benchmark('find (last match)', () => {
    arr.find(x => x === size - 1);
  }));

  // Transformation
  results.push(benchmark('map (double values)', () => {
    arr.map(x => x * 2);
  }));

  results.push(benchmark('filter (even numbers)', () => {
    arr.filter(x => x % 2 === 0);
  }));

  results.push(benchmark('slice (copy)', () => {
    arr.slice();
  }));

  results.push(benchmark('spread (copy)', () => {
    [...arr];
  }));

  results.push(benchmark('Array.from (copy)', () => {
    Array.from(arr);
  }));

  results.forEach(r => console.log(formatResult(r)));
}

/**
 * Object vs Map Benchmarks
 */
function runMapBenchmarks(size) {
  console.log(`\n${COLORS.magenta}═══════════════════════════════════════════════════════════${COLORS.reset}`);
  console.log(`${COLORS.magenta}  OBJECT vs MAP BENCHMARKS (size: ${size})${COLORS.reset}`);
  console.log(`${COLORS.magenta}═══════════════════════════════════════════════════════════${COLORS.reset}\n`);

  const keys = Array.from({ length: size }, (_, i) => `key${i}`);
  const numKeys = Array.from({ length: size }, (_, i) => i);

  const results = [];

  // Object operations
  results.push(benchmark('Object: set string keys', () => {
    const obj = {};
    for (let i = 0; i < 1000; i++) obj[`key${i}`] = i;
  }));

  results.push(benchmark('Map: set string keys', () => {
    const map = new Map();
    for (let i = 0; i < 1000; i++) map.set(`key${i}`, i);
  }));

  // Pre-populated for get/delete tests
  const obj = {};
  const map = new Map();
  for (let i = 0; i < size; i++) {
    obj[`key${i}`] = i;
    map.set(`key${i}`, i);
  }

  results.push(benchmark('Object: get existing key', () => {
    for (let i = 0; i < 1000; i++) {
      const val = obj[`key${i % size}`];
    }
  }));

  results.push(benchmark('Map: get existing key', () => {
    for (let i = 0; i < 1000; i++) {
      map.get(`key${i % size}`);
    }
  }));

  results.push(benchmark('Object: hasOwnProperty', () => {
    for (let i = 0; i < 1000; i++) {
      obj.hasOwnProperty(`key${i % size}`);
    }
  }));

  results.push(benchmark('Map: has', () => {
    for (let i = 0; i < 1000; i++) {
      map.has(`key${i % size}`);
    }
  }));

  results.push(benchmark('Object: iterate keys', () => {
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const val = obj[key];
      }
    }
  }));

  results.push(benchmark('Map: iterate entries', () => {
    for (const [key, val] of map) {
      // access both
    }
  }));

  results.push(benchmark('Object.keys().length', () => {
    Object.keys(obj).length;
  }));

  results.push(benchmark('Map.size', () => {
    map.size;
  }));

  results.forEach(r => console.log(formatResult(r)));
}

/**
 * Set Benchmarks
 */
function runSetBenchmarks(size) {
  console.log(`\n${COLORS.yellow}═══════════════════════════════════════════════════════════${COLORS.reset}`);
  console.log(`${COLORS.yellow}  SET vs ARRAY BENCHMARKS (size: ${size})${COLORS.reset}`);
  console.log(`${COLORS.yellow}═══════════════════════════════════════════════════════════${COLORS.reset}\n`);

  const arr = Array.from({ length: size }, (_, i) => i);
  const set = new Set(arr);

  const results = [];

  // Add operations
  results.push(benchmark('Array: push (add)', () => {
    const a = [];
    for (let i = 0; i < 1000; i++) a.push(i);
  }));

  results.push(benchmark('Set: add', () => {
    const s = new Set();
    for (let i = 0; i < 1000; i++) s.add(i);
  }));

  // Search operations
  results.push(benchmark('Array: includes (first)', () => {
    arr.includes(0);
  }));

  results.push(benchmark('Set: has (first)', () => {
    set.has(0);
  }));

  results.push(benchmark('Array: includes (last)', () => {
    arr.includes(size - 1);
  }));

  results.push(benchmark('Set: has (last)', () => {
    set.has(size - 1);
  }));

  results.push(benchmark('Array: includes (not found)', () => {
    arr.includes(-1);
  }));

  results.push(benchmark('Set: has (not found)', () => {
    set.has(-1);
  }));

  // Unique values
  results.push(benchmark('Array: filter unique (indexOf)', () => {
    arr.slice(0, 100).filter((v, i, a) => a.indexOf(v) === i);
  }));

  results.push(benchmark('Array: unique with Set', () => {
    [...new Set(arr.slice(0, 100))];
  }));

  results.forEach(r => console.log(formatResult(r)));
}

/**
 * Print recommendations based on benchmarks
 */
function printRecommendations() {
  console.log(`\n${COLORS.green}═══════════════════════════════════════════════════════════${COLORS.reset}`);
  console.log(`${COLORS.green}  RECOMMENDATIONS${COLORS.reset}`);
  console.log(`${COLORS.green}═══════════════════════════════════════════════════════════${COLORS.reset}\n`);

  const recommendations = [
    {
      scenario: 'Frequent lookups by key',
      use: 'Map or Set',
      avoid: 'Array.includes() or Array.find()',
      reason: 'O(1) vs O(n) lookup time'
    },
    {
      scenario: 'Add/remove from start of collection',
      use: 'Linked list or reassign array',
      avoid: 'Array.unshift() / Array.shift()',
      reason: 'O(n) reindexing cost'
    },
    {
      scenario: 'Need unique values',
      use: 'Set',
      avoid: 'Array with manual deduplication',
      reason: 'Built-in uniqueness guarantee'
    },
    {
      scenario: 'Key-value with non-string keys',
      use: 'Map',
      avoid: 'Object',
      reason: 'Objects coerce keys to strings'
    },
    {
      scenario: 'Need to know collection size frequently',
      use: 'Map.size or Set.size',
      avoid: 'Object.keys().length',
      reason: 'O(1) vs O(n)'
    },
    {
      scenario: 'Ordered iteration of keys',
      use: 'Map',
      avoid: 'Object',
      reason: 'Maps preserve insertion order for all key types'
    }
  ];

  recommendations.forEach((rec, i) => {
    console.log(`${COLORS.blue}${i + 1}. ${rec.scenario}${COLORS.reset}`);
    console.log(`   ${COLORS.green}Use:${COLORS.reset} ${rec.use}`);
    console.log(`   ${COLORS.yellow}Avoid:${COLORS.reset} ${rec.avoid}`);
    console.log(`   ${COLORS.gray}Reason:${COLORS.reset} ${rec.reason}\n`);
  });
}

// Main
function main() {
  const args = process.argv.slice(2);
  let size = DEFAULT_SIZE;
  let type = 'all';

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--size' && args[i + 1]) {
      size = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--type' && args[i + 1]) {
      type = args[i + 1];
      i++;
    }
  }

  console.log(`${COLORS.cyan}JavaScript Data Structures Benchmark${COLORS.reset}`);
  console.log(`${COLORS.gray}Size: ${size} | Iterations: ${ITERATIONS}${COLORS.reset}`);

  if (type === 'all' || type === 'array') {
    runArrayBenchmarks(size);
  }

  if (type === 'all' || type === 'map') {
    runMapBenchmarks(size);
  }

  if (type === 'all' || type === 'set') {
    runSetBenchmarks(size);
  }

  printRecommendations();
}

main();
