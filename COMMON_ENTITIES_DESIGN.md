# Common Entities Design Document

## Problem Statement

In a multi-user fitness tracking application, we need to handle shared (common) exercises while allowing user customization without creating duplicate documents in the database.

### Current Situation
- We have an `isCommon` field on Exercise, Goal, and PredefinedWorkout models
- Common entities are created by admin users and visible to all users
- Users can create their own private entities

### The Challenge
When 100 users want to track "Pull-ups":
- **Without optimization**: 100 duplicate "Pull-ups" documents in the database
- **Goal**: 1 common "Pull-ups" document with user-specific customizations

### Use Cases to Support

1. **Common Exercise**: User uses "Pull-ups" exactly as defined by admin
2. **Modified Exercise**: User wants to rename "Pull-ups" to "Pull up" or add personal notes
3. **Private Exercise**: User creates "Dragon Flag" (not in common library)

## Proposed Solutions

### Option 1: Separate Customization Collection

**Schema Design:**
```javascript
// exercises collection
{
  _id: ObjectId("..."),
  name: "Pull-ups",
  muscles: ["lats", "biceps", "rhomboids"],
  equipment: ["pull-up-bar"],
  description: "...",
  isCommon: true,
  createdBy: ObjectId("admin-user-id")
}

// user_exercise_customizations collection
{
  _id: ObjectId("..."),
  userId: ObjectId("user-123"),
  exerciseId: ObjectId("pull-ups-id"),
  customName: "Pull up",
  customNotes: "Use wide grip on Mondays",
  isFavorite: true,
  personalBestReps: 15
}
```

**Pros:**
- Clean separation of concerns
- No modification to existing Exercise schema
- Easy to query user customizations separately
- Scalable - customizations don't bloat exercise documents

**Cons:**
- Requires JOIN operations (or multiple queries)
- More complex query logic to merge data
- Additional collection to maintain

**Query Pattern:**
```javascript
// Get exercises for user with customizations
const exercises = await Exercise.find({ 
  $or: [{ isCommon: true }, { createdBy: userId }] 
});
const customizations = await UserExerciseCustomization.find({ userId });
// Merge in application layer
```

### Option 2: Exercise Inheritance Pattern

**Schema Design:**
```javascript
// exercises collection only
{
  _id: ObjectId("..."),
  name: "Pull-ups",
  baseExerciseId: null,  // null = original/common exercise
  muscles: ["lats", "biceps"],
  isCommon: true,
  createdBy: ObjectId("admin-user-id")
}

// User's customized version
{
  _id: ObjectId("..."),
  name: "Pull up",  // customized name
  baseExerciseId: ObjectId("pull-ups-id"),  // references common exercise
  muscles: ["lats", "biceps"],  // can override or inherit
  isCommon: false,
  createdBy: ObjectId("user-123"),
  // Only store changed fields, inherit rest from base
}
```

**Pros:**
- Single collection approach
- Clear parent-child relationship
- Can track exercise variants/progressions

**Cons:**
- Still creates documents for each customization
- Complex inheritance logic needed
- Potential for data inconsistency

### Option 3: Embedded Customizations (Hybrid)

**Schema Design:**
```javascript
// exercises collection
{
  _id: ObjectId("..."),
  name: "Pull-ups",
  muscles: ["lats", "biceps"],
  equipment: ["pull-up-bar"],
  isCommon: true,
  createdBy: ObjectId("admin-user-id"),
  
  // Embedded user customizations
  userCustomizations: [
    {
      userId: ObjectId("user-123"),
      customName: "Pull up",
      customNotes: "Wide grip preferred",
      isFavorite: true,
      lastUsed: ISODate("2024-01-15"),
      personalBest: { reps: 15, date: ISODate("2024-01-10") }
    },
    {
      userId: ObjectId("user-456"),
      customName: "Chin-ups",
      customNotes: "Underhand grip",
      isFavorite: false
    }
  ]
}
```

**Pros:**
- Single query to get exercise with customizations
- Atomic updates possible
- Good read performance

**Cons:**
- Document size grows with users (MongoDB 16MB limit)
- Not suitable for large user bases
- Harder to query across all user customizations

### Option 4: Virtual Layer Approach

**Schema Design:**
```javascript
// exercises collection (unchanged)
{
  _id: ObjectId("..."),
  name: "Pull-ups",
  muscles: ["lats", "biceps"],
  isCommon: true,
  createdBy: ObjectId("admin-user-id")
}

// user_preferences collection
{
  userId: ObjectId("user-123"),
  exercisePreferences: {
    "pull-ups-id": {
      customName: "Pull up",
      isFavorite: true,
      notes: "Wide grip"
    },
    "squat-id": {
      customName: "Back Squat",
      defaultWeight: 100
    }
  }
}
```

**Pros:**
- Flexible preference storage
- Easy to add new customization types
- Single document per user for all preferences

**Cons:**
- Nested document queries can be complex
- May need to denormalize for performance

## Recommendation

For a fitness application with potential for growth, I recommend **Option 1 (Separate Customization Collection)** with the following implementation details:

### Implementation Strategy

1. **Data Model:**
   - Keep Exercise model clean and focused
   - Create UserExerciseCustomization model for personalization
   - Use MongoDB aggregation pipeline for efficient joins

2. **API Design:**
   ```javascript
   GET /api/v1/exercises
   - Returns common exercises + user's private exercises
   - Merges customizations in application layer
   - Uses caching for common exercises
   
   POST /api/v1/exercises/:id/customize
   - Creates/updates user customization
   - Validates exercise exists and is accessible
   
   DELETE /api/v1/exercises/:id/customize
   - Removes customization (reverts to default)
   ```

3. **Indexing Strategy:**
   - Compound index on `(userId, exerciseId)` for customizations
   - Index on `isCommon` and `createdBy` for exercises
   - Consider text index on exercise names for search

4. **Caching Strategy:**
   - Cache common exercises (changes infrequently)
   - Cache user customizations per session
   - Invalidate on updates

### Migration Path

1. **Phase 1**: Implement admin role and common exercise creation
2. **Phase 2**: Add customization collection and API
3. **Phase 3**: Update UI to show/edit customizations
4. **Phase 4**: Optimize with caching and aggregation pipelines

## Questions for Data Engineer

1. **Scale considerations**: Expected number of users and exercises?
2. **Query patterns**: Most common queries beyond basic CRUD?
3. **Performance requirements**: Acceptable latency for exercise lists?
4. **Data consistency**: How important is real-time consistency vs eventual consistency?
5. **Future features**: Plans for exercise history, analytics, or social features?

## Alternative Considerations

- **GraphQL**: Could solve the N+1 query problem elegantly
- **Event Sourcing**: Track all customizations as events
- **CQRS**: Separate read/write models for optimization
- **Denormalization**: Pre-compute user views for performance

---

*Document prepared for consultation with data engineering team*