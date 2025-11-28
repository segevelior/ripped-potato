const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const UserMemory = require('../models/UserMemory');
const { auth } = require('../middleware/auth');

// GET /api/v1/memories - Get all memories for the authenticated user
router.get('/', auth, async (req, res) => {
  try {
    const { category, isActive, importance } = req.query;

    let userMemory = await UserMemory.findOne({ user: req.user.id });

    if (!userMemory) {
      return res.json({
        success: true,
        data: {
          memories: [],
          count: 0
        }
      });
    }

    let memories = userMemory.memories;

    // Apply filters
    if (category) {
      memories = memories.filter(m => m.category === category);
    }
    if (isActive !== undefined) {
      const activeFilter = isActive === 'true';
      memories = memories.filter(m => m.isActive === activeFilter);
    }
    if (importance) {
      memories = memories.filter(m => m.importance === importance);
    }

    // Sort by importance (high first) then by createdAt (newest first)
    const importanceOrder = { high: 0, medium: 1, low: 2 };
    memories.sort((a, b) => {
      if (importanceOrder[a.importance] !== importanceOrder[b.importance]) {
        return importanceOrder[a.importance] - importanceOrder[b.importance];
      }
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    res.json({
      success: true,
      data: {
        memories,
        count: memories.length
      }
    });
  } catch (error) {
    console.error('Error fetching memories:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch memories',
      error: error.message
    });
  }
});

// GET /api/v1/memories/active - Get only active memories (for AI prompt injection)
router.get('/active', auth, async (req, res) => {
  try {
    const userMemory = await UserMemory.findOne({ user: req.user.id });

    if (!userMemory) {
      return res.json({
        success: true,
        data: {
          memories: [],
          count: 0
        }
      });
    }

    const activeMemories = userMemory.memories.filter(m => m.isActive);

    // Sort by importance
    const importanceOrder = { high: 0, medium: 1, low: 2 };
    activeMemories.sort((a, b) => importanceOrder[a.importance] - importanceOrder[b.importance]);

    res.json({
      success: true,
      data: {
        memories: activeMemories,
        count: activeMemories.length
      }
    });
  } catch (error) {
    console.error('Error fetching active memories:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch active memories',
      error: error.message
    });
  }
});

// POST /api/v1/memories - Create a new memory
router.post('/', auth, async (req, res) => {
  try {
    const { content, category, tags, source, importance } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Memory content is required'
      });
    }

    if (content.length > 500) {
      return res.status(400).json({
        success: false,
        message: 'Memory content must be 500 characters or less'
      });
    }

    const memoryItem = {
      content: content.trim(),
      category: category || 'general',
      tags: tags || [],
      source: source || 'user',
      importance: importance || 'medium',
      isActive: true
    };

    // Find or create user memory document
    let userMemory = await UserMemory.findOne({ user: req.user.id });

    if (!userMemory) {
      userMemory = new UserMemory({
        user: req.user.id,
        memories: [memoryItem]
      });
    } else {
      userMemory.memories.push(memoryItem);
    }

    await userMemory.save();

    // Get the newly created memory
    const newMemory = userMemory.memories[userMemory.memories.length - 1];

    res.status(201).json({
      success: true,
      message: 'Memory created successfully',
      data: newMemory
    });
  } catch (error) {
    console.error('Error creating memory:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create memory',
      error: error.message
    });
  }
});

// PUT /api/v1/memories/:memoryId - Update a specific memory
router.put('/:memoryId', auth, async (req, res) => {
  try {
    const { memoryId } = req.params;
    const { content, category, tags, importance, isActive } = req.body;

    if (!mongoose.Types.ObjectId.isValid(memoryId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid memory ID'
      });
    }

    const userMemory = await UserMemory.findOne({ user: req.user.id });

    if (!userMemory) {
      return res.status(404).json({
        success: false,
        message: 'No memories found'
      });
    }

    const memory = userMemory.memories.id(memoryId);

    if (!memory) {
      return res.status(404).json({
        success: false,
        message: 'Memory not found'
      });
    }

    // Update fields if provided
    if (content !== undefined) {
      if (content.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Memory content cannot be empty'
        });
      }
      if (content.length > 500) {
        return res.status(400).json({
          success: false,
          message: 'Memory content must be 500 characters or less'
        });
      }
      memory.content = content.trim();
    }
    if (category !== undefined) memory.category = category;
    if (tags !== undefined) memory.tags = tags;
    if (importance !== undefined) memory.importance = importance;
    if (isActive !== undefined) memory.isActive = isActive;

    await userMemory.save();

    res.json({
      success: true,
      message: 'Memory updated successfully',
      data: memory
    });
  } catch (error) {
    console.error('Error updating memory:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update memory',
      error: error.message
    });
  }
});

// PATCH /api/v1/memories/:memoryId/toggle - Toggle memory active status
router.patch('/:memoryId/toggle', auth, async (req, res) => {
  try {
    const { memoryId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(memoryId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid memory ID'
      });
    }

    const userMemory = await UserMemory.findOne({ user: req.user.id });

    if (!userMemory) {
      return res.status(404).json({
        success: false,
        message: 'No memories found'
      });
    }

    const memory = userMemory.memories.id(memoryId);

    if (!memory) {
      return res.status(404).json({
        success: false,
        message: 'Memory not found'
      });
    }

    memory.isActive = !memory.isActive;
    await userMemory.save();

    res.json({
      success: true,
      message: `Memory ${memory.isActive ? 'activated' : 'deactivated'} successfully`,
      data: memory
    });
  } catch (error) {
    console.error('Error toggling memory:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle memory',
      error: error.message
    });
  }
});

// DELETE /api/v1/memories/:memoryId - Delete a specific memory
router.delete('/:memoryId', auth, async (req, res) => {
  try {
    const { memoryId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(memoryId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid memory ID'
      });
    }

    const userMemory = await UserMemory.findOne({ user: req.user.id });

    if (!userMemory) {
      return res.status(404).json({
        success: false,
        message: 'No memories found'
      });
    }

    const memoryIndex = userMemory.memories.findIndex(
      m => m._id.toString() === memoryId
    );

    if (memoryIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Memory not found'
      });
    }

    userMemory.memories.splice(memoryIndex, 1);
    await userMemory.save();

    res.json({
      success: true,
      message: 'Memory deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting memory:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete memory',
      error: error.message
    });
  }
});

module.exports = router;
