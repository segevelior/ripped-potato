const Goal = require('../models/Goal');
const UserGoalModification = require('../models/UserGoalModification');

class GoalService {
  /**
   * Get all goals for a user, including their modifications
   */
  static async getGoalsForUser(userId) {
    // Get all goals (common and user's private)
    const goals = await Goal.find({
      $or: [
        { isCommon: true },
        { createdBy: userId }
      ]
    }).lean();
    
    // Get all user modifications
    const modifications = await UserGoalModification.find({ userId }).lean();
    
    // Create a map for quick lookup
    const modMap = new Map();
    modifications.forEach(mod => {
      modMap.set(mod.goalId.toString(), mod);
    });
    
    // Apply modifications to goals
    return goals.map(goal => {
      const modification = modMap.get(goal._id.toString());
      if (modification) {
        const UserGoalModificationDoc = new UserGoalModification(modification);
        return UserGoalModificationDoc.applyToGoal(goal);
      }
      return goal;
    });
  }
  
  /**
   * Get a single goal for a user with modifications applied
   */
  static async getGoalForUser(goalId, userId) {
    const goal = await Goal.findById(goalId).lean();
    
    if (!goal) {
      return null;
    }
    
    // Check if user has access to this goal
    if (!goal.isCommon && goal.createdBy?.toString() !== userId.toString()) {
      return null;
    }
    
    // Get user's modification if exists
    const modification = await UserGoalModification.findOne({
      userId,
      goalId
    }).lean();
    
    if (modification) {
      const UserGoalModificationDoc = new UserGoalModification(modification);
      return UserGoalModificationDoc.applyToGoal(goal);
    }
    
    return goal;
  }
  
  /**
   * Save or update a user's goal modification
   */
  static async saveModification(userId, goalId, modifications, metadata) {
    const goal = await Goal.findById(goalId);
    
    if (!goal) {
      throw new Error('Goal not found');
    }
    
    // Can only modify common goals or goals from other users
    if (!goal.isCommon && goal.createdBy?.toString() !== userId.toString()) {
      throw new Error('Cannot modify this goal');
    }
    
    // If it's the user's own private goal, they should use the regular update endpoint
    if (goal.createdBy?.toString() === userId.toString() && !goal.isCommon) {
      throw new Error('Use regular update endpoint for your own goals');
    }
    
    const modification = await UserGoalModification.findOneAndUpdate(
      { userId, goalId },
      {
        userId,
        goalId,
        modifications,
        metadata
      },
      {
        new: true,
        upsert: true,
        runValidators: true
      }
    );
    
    return modification;
  }
  
  /**
   * Remove a user's goal modification
   */
  static async removeModification(userId, goalId) {
    const result = await UserGoalModification.findOneAndDelete({
      userId,
      goalId
    });
    
    if (!result) {
      throw new Error('No modification found for this goal');
    }
    
    return result;
  }
  
  /**
   * Toggle favorite status for a goal
   */
  static async toggleFavorite(userId, goalId, isFavorite) {
    const goal = await Goal.findById(goalId);
    
    if (!goal) {
      throw new Error('Goal not found');
    }
    
    // Ensure modification exists with at least the favorite status
    const modification = await UserGoalModification.findOneAndUpdate(
      { userId, goalId },
      {
        $set: {
          'metadata.isFavorite': isFavorite
        }
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true
      }
    );
    
    return modification;
  }
  
  /**
   * Update personal milestone completion
   */
  static async updateMilestoneCompletion(userId, goalId, milestoneId, completed) {
    const modification = await UserGoalModification.findOne({ userId, goalId });
    
    if (!modification) {
      throw new Error('No modification found for this goal');
    }
    
    // Find and update the milestone
    const milestone = modification.metadata.personalMilestones.find(
      m => m.originalMilestoneId.toString() === milestoneId
    );
    
    if (milestone) {
      milestone.completed = completed;
      milestone.completedDate = completed ? new Date() : null;
    } else {
      // Create new milestone tracking
      modification.metadata.personalMilestones.push({
        originalMilestoneId: milestoneId,
        completed,
        completedDate: completed ? new Date() : null
      });
    }
    
    await modification.save();
    return modification;
  }
}

module.exports = GoalService;