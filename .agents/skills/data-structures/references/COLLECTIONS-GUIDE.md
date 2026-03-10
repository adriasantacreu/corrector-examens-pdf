# JavaScript Collections Guide

> Master Arrays, Objects, Maps, and Sets for efficient data handling

## Quick Comparison

| Feature | Array | Object | Map | Set |
|---------|-------|--------|-----|-----|
| **Order** | Indexed | Insertion* | Insertion | Insertion |
| **Key Types** | Numbers | Strings/Symbols | Any | N/A (values) |
| **Duplicates** | Allowed | Keys unique | Keys unique | Not allowed |
| **Size** | `.length` | `Object.keys().length` | `.size` | `.size` |
| **Iteration** | for...of | for...in | for...of | for...of |
| **Performance** | O(n) search | O(1) access | O(1) access | O(1) lookup |

*Object key order: integers (sorted), then strings/symbols (insertion order)

---

## Array

### When to Use

- Ordered list of items
- Need index-based access
- Frequently iterate through all items
- Need array methods (map, filter, reduce)

### Creation

```javascript
// Literal (preferred)
const arr = [1, 2, 3];

// Constructor (avoid for single number)
const arr = new Array(5);  // [empty × 5]

// Array.from (for iterables)
const arr = Array.from('hello');  // ['h', 'e', 'l', 'l', 'o']
const arr = Array.from({ length: 5 }, (_, i) => i);  // [0, 1, 2, 3, 4]

// Array.of (creates array from arguments)
const arr = Array.of(5);  // [5]
```

### Common Operations

```javascript
// Add/Remove
arr.push(item);     // Add to end - O(1)
arr.pop();          // Remove from end - O(1)
arr.unshift(item);  // Add to start - O(n) ⚠️
arr.shift();        // Remove from start - O(n) ⚠️

// Access
arr[0];             // First element
arr[arr.length - 1]; // Last element
arr.at(-1);         // Last element (ES2022)

// Search
arr.includes(item);  // Boolean - O(n)
arr.indexOf(item);   // Index or -1 - O(n)
arr.find(fn);        // First match or undefined
arr.findIndex(fn);   // First match index or -1

// Transform (return new array)
arr.map(x => x * 2);
arr.filter(x => x > 0);
arr.slice(1, 3);     // Subarray

// Mutate
arr.sort((a, b) => a - b);
arr.reverse();
arr.splice(1, 1, 'new');
```

### Performance Tips

```javascript
// Use Set for frequent lookups
const set = new Set(arr);
set.has(value);  // O(1) instead of O(n)

// Avoid shift/unshift for large arrays
// Instead, use reverse + push/pop + reverse

// Pre-allocate when size is known
const arr = new Array(1000);
for (let i = 0; i < 1000; i++) arr[i] = i;
```

---

## Object

### When to Use

- Dictionary with string keys
- JSON-compatible data
- Object methods and prototypes
- Simple configuration objects

### Creation

```javascript
// Literal (preferred)
const obj = { name: 'Alice', age: 30 };

// Constructor
const obj = new Object();

// Object.create (for prototype control)
const obj = Object.create(null);  // No prototype

// From entries
const obj = Object.fromEntries([['a', 1], ['b', 2]]);
```

### Common Operations

```javascript
// Access
obj.name;           // Dot notation
obj['name'];        // Bracket notation
obj?.nested?.prop;  // Optional chaining

// Modify
obj.name = 'Bob';
delete obj.name;

// Check existence
'name' in obj;           // Includes prototype
obj.hasOwnProperty('name');  // Own property only
Object.hasOwn(obj, 'name');  // ES2022, preferred

// Get keys/values
Object.keys(obj);    // ['name', 'age']
Object.values(obj);  // ['Alice', 30]
Object.entries(obj); // [['name', 'Alice'], ['age', 30]]

// Iterate
for (const key in obj) {
  if (Object.hasOwn(obj, key)) {
    console.log(key, obj[key]);
  }
}

// Or safer:
for (const [key, value] of Object.entries(obj)) {
  console.log(key, value);
}

// Clone
const shallow = { ...obj };
const deep = JSON.parse(JSON.stringify(obj));
const deep2 = structuredClone(obj);  // Modern
```

### Limitations

```javascript
// Keys are always strings
obj[1] = 'value';      // Actually obj['1']
obj[true] = 'value';   // Actually obj['true']
obj[{a: 1}] = 'value'; // Actually obj['[object Object]']

// Prototype pollution risk
obj['__proto__'] = malicious;  // Security risk!
// Use Map or Object.create(null) for untrusted keys
```

---

## Map

### When to Use

- Need non-string keys (objects, numbers, etc.)
- Frequent additions and deletions
- Need to preserve insertion order
- Need `.size` property
- Untrusted/dynamic keys (safer than Object)

### Creation

```javascript
// Constructor
const map = new Map();

// From entries
const map = new Map([
  ['key1', 'value1'],
  ['key2', 'value2']
]);

// From Object
const map = new Map(Object.entries(obj));
```

### Common Operations

```javascript
// Set/Get
map.set('key', 'value');  // Returns map (chainable)
map.set(objKey, 'value'); // Object as key
map.get('key');           // 'value' or undefined

// Check existence
map.has('key');           // true/false

// Delete
map.delete('key');        // true if existed
map.clear();              // Remove all

// Size
map.size;                 // O(1)

// Iterate
for (const [key, value] of map) {
  console.log(key, value);
}

map.forEach((value, key) => {
  console.log(key, value);
});

// Get iterators
map.keys();      // Iterator of keys
map.values();    // Iterator of values
map.entries();   // Iterator of [key, value]
```

### Object Keys

```javascript
const userA = { id: 1 };
const userB = { id: 2 };

// Each object is a unique key
const permissions = new Map();
permissions.set(userA, ['read']);
permissions.set(userB, ['read', 'write']);

permissions.get(userA);  // ['read']
permissions.get({ id: 1 });  // undefined (different object reference)
```

### WeakMap

```javascript
// Keys must be objects, garbage collected when no references
const cache = new WeakMap();

function process(obj) {
  if (cache.has(obj)) {
    return cache.get(obj);
  }
  const result = expensiveOperation(obj);
  cache.set(obj, result);
  return result;
}
// When obj is garbage collected, cache entry is too
```

---

## Set

### When to Use

- Store unique values only
- Fast membership checking
- Remove duplicates from array
- Mathematical set operations

### Creation

```javascript
// Constructor
const set = new Set();

// From array
const set = new Set([1, 2, 2, 3]);  // Set(3) {1, 2, 3}

// From string
const set = new Set('hello');  // Set(4) {'h', 'e', 'l', 'o'}
```

### Common Operations

```javascript
// Add
set.add(1);      // Returns set (chainable)
set.add(1);      // No effect (already exists)

// Check existence
set.has(1);      // true - O(1)

// Delete
set.delete(1);   // true if existed
set.clear();     // Remove all

// Size
set.size;        // O(1)

// Iterate
for (const value of set) {
  console.log(value);
}

set.forEach(value => console.log(value));
```

### Common Patterns

```javascript
// Remove duplicates from array
const unique = [...new Set(array)];

// Array intersection
const intersection = [...setA].filter(x => setB.has(x));

// Array union
const union = new Set([...setA, ...setB]);

// Array difference
const difference = [...setA].filter(x => !setB.has(x));

// Check subset
const isSubset = [...setA].every(x => setB.has(x));
```

### WeakSet

```javascript
// Values must be objects, garbage collected when no references
const visited = new WeakSet();

function track(obj) {
  if (visited.has(obj)) {
    return 'Already visited';
  }
  visited.add(obj);
  return 'First visit';
}
```

---

## Choosing the Right Collection

```
Start
  │
  ├─ Need ordered items by index?
  │    └─ Yes → Array
  │
  ├─ Need unique values only?
  │    └─ Yes → Set
  │
  ├─ Need key-value pairs?
  │    │
  │    ├─ Keys are strings only?
  │    │    └─ Yes → Object (or Map for performance)
  │    │
  │    ├─ Keys are objects?
  │    │    └─ Yes → Map (or WeakMap if GC needed)
  │    │
  │    └─ Need fast .size?
  │         └─ Yes → Map
  │
  └─ Default → Object or Array
```

---

## Performance Summary

| Operation | Array | Object | Map | Set |
|-----------|-------|--------|-----|-----|
| Add | O(1)* | O(1) | O(1) | O(1) |
| Delete | O(n) | O(1) | O(1) | O(1) |
| Find/Has | O(n) | O(1) | O(1) | O(1) |
| Get size | O(1) | O(n) | O(1) | O(1) |

*Array.push is O(1), but unshift/shift are O(n)

---

**Author:** Dr. Umit Kacar & Muhsin Elcicek
**Version:** 1.0.0
**Last Updated:** December 2025
