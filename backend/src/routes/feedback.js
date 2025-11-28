const express = require('express');
const router = express.Router();
const Feedback = require('../models/Feedback');
const User = require('../models/User');
const { auth } = require('../middleware/auth');
const OpenAI = require('openai');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Helper function to get user profile info (without sensitive data)
const getUserProfileInfo = (user) => {
  if (!user) return null;
  return {
    fitnessLevel: user.profile?.fitnessLevel,
    goals: user.profile?.goals || [],
    sportPreferences: user.profile?.sportPreferences || [],
    injuries: user.profile?.injuries || []
  };
};

// POST /api/v1/feedback - Submit new feedback
router.post('/', auth, async (req, res) => {
  try {
    const { rating, feedbackText, category, page } = req.body;

    if (!rating || !['thumbs_up', 'thumbs_down'].includes(rating)) {
      return res.status(400).json({
        success: false,
        message: 'Rating is required and must be thumbs_up or thumbs_down'
      });
    }

    const feedback = new Feedback({
      user: req.user.id,
      rating,
      feedbackText: feedbackText?.slice(0, 1000),
      category: category || 'general',
      page,
      userAgent: req.headers['user-agent']
    });

    await feedback.save();

    res.status(201).json({
      success: true,
      message: 'Feedback submitted successfully',
      data: feedback
    });
  } catch (error) {
    console.error('Error submitting feedback:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit feedback',
      error: error.message
    });
  }
});

// GET /api/v1/feedback - Get all feedback (admin only)
router.get('/', auth, async (req, res) => {
  try {
    // Only superAdmin can view all feedback
    if (req.user.role !== 'superAdmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    const {
      status,
      rating,
      category,
      limit = 50,
      page = 1,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (rating) filter.rating = rating;
    if (category) filter.category = category;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    const [feedbacks, total] = await Promise.all([
      Feedback.find(filter)
        .populate('user', 'name email profile')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Feedback.countDocuments(filter)
    ]);

    // Add user profile info to each feedback
    const feedbacksWithProfile = feedbacks.map(fb => ({
      ...fb,
      userProfile: getUserProfileInfo(fb.user),
      user: fb.user ? { _id: fb.user._id } : null // Remove name/email for privacy
    }));

    res.json({
      success: true,
      data: {
        feedbacks: feedbacksWithProfile,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('Error fetching feedback:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch feedback',
      error: error.message
    });
  }
});

// GET /api/v1/feedback/stats - Get feedback statistics (admin only)
router.get('/stats', auth, async (req, res) => {
  try {
    if (req.user.role !== 'superAdmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    const [
      totalCount,
      thumbsUpCount,
      thumbsDownCount,
      statusCounts,
      categoryCounts,
      recentFeedback
    ] = await Promise.all([
      Feedback.countDocuments(),
      Feedback.countDocuments({ rating: 'thumbs_up' }),
      Feedback.countDocuments({ rating: 'thumbs_down' }),
      Feedback.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      Feedback.aggregate([
        { $group: { _id: '$category', count: { $sum: 1 } } }
      ]),
      Feedback.find()
        .populate('user', 'name email')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean()
    ]);

    res.json({
      success: true,
      data: {
        total: totalCount,
        thumbsUp: thumbsUpCount,
        thumbsDown: thumbsDownCount,
        byStatus: statusCounts.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        byCategory: categoryCounts.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        recent: recentFeedback
      }
    });
  } catch (error) {
    console.error('Error fetching feedback stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch feedback statistics',
      error: error.message
    });
  }
});

// PATCH /api/v1/feedback/:id - Update feedback status (admin only)
router.patch('/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'superAdmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    const { status, adminNotes } = req.body;

    const feedback = await Feedback.findById(req.params.id);
    if (!feedback) {
      return res.status(404).json({
        success: false,
        message: 'Feedback not found'
      });
    }

    if (status) feedback.status = status;
    if (adminNotes !== undefined) feedback.adminNotes = adminNotes;

    await feedback.save();

    res.json({
      success: true,
      message: 'Feedback updated successfully',
      data: feedback
    });
  } catch (error) {
    console.error('Error updating feedback:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update feedback',
      error: error.message
    });
  }
});

// PATCH /api/v1/feedback/bulk - Bulk update feedback status (superAdmin only)
router.patch('/bulk', auth, async (req, res) => {
  try {
    if (req.user.role !== 'superAdmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. SuperAdmin only.'
      });
    }

    const { ids, status, adminNotes } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'ids array is required'
      });
    }

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'status is required'
      });
    }

    const updateData = { status };
    if (adminNotes !== undefined) {
      updateData.adminNotes = adminNotes;
    }

    const result = await Feedback.updateMany(
      { _id: { $in: ids } },
      { $set: updateData }
    );

    res.json({
      success: true,
      message: `Updated ${result.modifiedCount} feedback items`,
      data: { modifiedCount: result.modifiedCount }
    });
  } catch (error) {
    console.error('Error bulk updating feedback:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to bulk update feedback',
      error: error.message
    });
  }
});

// DELETE /api/v1/feedback/:id - Delete feedback (admin only)
router.delete('/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'superAdmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    const feedback = await Feedback.findByIdAndDelete(req.params.id);
    if (!feedback) {
      return res.status(404).json({
        success: false,
        message: 'Feedback not found'
      });
    }

    res.json({
      success: true,
      message: 'Feedback deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting feedback:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete feedback',
      error: error.message
    });
  }
});

// GET /api/v1/feedback/conversations - Get conversation feedbacks (superAdmin only)
// Queries chatConversations collection directly and enriches with user profile info
router.get('/conversations', auth, async (req, res) => {
  try {
    if (req.user.role !== 'superAdmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. SuperAdmin only.'
      });
    }

    const {
      page = 1,
      limit = 50,
      rating,
      status: filterStatus,
      sortBy = 'timestamp',
      sortOrder = 'desc'
    } = req.query;

    const mongoose = require('mongoose');
    const db = mongoose.connection.db;

    // Build aggregation pipeline to extract feedbacks from chatConversations
    const pipeline = [];

    // Unwind feedback array
    pipeline.push({ $unwind: '$feedback' });

    // Match filters
    const matchStage = {};
    if (rating) {
      matchStage['feedback.rating'] = rating;
    }
    if (Object.keys(matchStage).length > 0) {
      pipeline.push({ $match: matchStage });
    }

    // Get total count
    const countPipeline = [...pipeline, { $count: 'total' }];
    const countResult = await db.collection('chatConversations').aggregate(countPipeline).toArray();
    const total = countResult[0]?.total || 0;

    // Add projection and pagination
    pipeline.push({
      $project: {
        conversation_id: 1,
        user_id: '$metadata.user_id',
        feedback: 1
      }
    });

    // Sort by feedback timestamp
    const sortDirection = sortOrder === 'desc' ? -1 : 1;
    pipeline.push({ $sort: { 'feedback.timestamp': sortDirection } });

    // Pagination
    pipeline.push({ $skip: (parseInt(page) - 1) * parseInt(limit) });
    pipeline.push({ $limit: parseInt(limit) });

    const feedbackDocs = await db.collection('chatConversations').aggregate(pipeline).toArray();

    // Transform to flat feedback list
    let feedbacks = feedbackDocs.map(doc => ({
      conversation_id: doc.conversation_id,
      message_index: doc.feedback.message_index,
      rating: doc.feedback.rating,
      feedback_text: doc.feedback.feedback_text,
      question_preview: doc.feedback.question_preview,
      answer_preview: doc.feedback.answer_preview,
      timestamp: doc.feedback.timestamp,
      user_id: doc.user_id
    }));

    // Enrich with user profile info
    const userIds = [...new Set(feedbacks.map(f => f.user_id).filter(Boolean))];
    const users = await User.find({ _id: { $in: userIds } })
      .select('_id profile')
      .lean();

    const userMap = {};
    users.forEach(u => {
      userMap[u._id.toString()] = {
        fitnessLevel: u.profile?.fitnessLevel,
        goals: u.profile?.goals || [],
        sportPreferences: u.profile?.sportPreferences || [],
        injuries: u.profile?.injuries || []
      };
    });

    // Get statuses for conversation feedbacks
    const statuses = await db.collection('conversationFeedbackStatus').find({}).toArray();
    const statusMap = {};
    statuses.forEach(s => {
      statusMap[`${s.conversationId}:${s.messageIndex}`] = s.status;
    });

    const enrichedFeedbacks = feedbacks.map(f => ({
      ...f,
      userProfile: userMap[f.user_id] || null,
      status: statusMap[`${f.conversation_id}:${f.message_index}`] || 'new'
    }));

    // Filter by status if requested (done after enrichment since status is in separate collection)
    let filteredFeedbacks = enrichedFeedbacks;
    if (filterStatus) {
      filteredFeedbacks = enrichedFeedbacks.filter(f => f.status === filterStatus);
    }

    res.json({
      success: true,
      data: {
        feedbacks: filteredFeedbacks,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: filterStatus ? filteredFeedbacks.length : total,
          pages: Math.ceil((filterStatus ? filteredFeedbacks.length : total) / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('Error fetching conversation feedbacks:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch conversation feedbacks',
      error: error.message
    });
  }
});

// PATCH /api/v1/feedback/conversations/status - Update conversation feedback status
router.patch('/conversations/status', auth, async (req, res) => {
  try {
    if (req.user.role !== 'superAdmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. SuperAdmin only.'
      });
    }

    const { conversationId, messageIndex, status } = req.body;

    if (!conversationId || messageIndex === undefined || !status) {
      return res.status(400).json({
        success: false,
        message: 'conversationId, messageIndex, and status are required'
      });
    }

    // Store status in a separate collection for conversation feedback
    const mongoose = require('mongoose');
    const db = mongoose.connection.db;

    await db.collection('conversationFeedbackStatus').updateOne(
      {
        conversationId,
        messageIndex: parseInt(messageIndex)
      },
      {
        $set: {
          status,
          updatedAt: new Date(),
          updatedBy: req.user.id
        }
      },
      { upsert: true }
    );

    res.json({
      success: true,
      message: 'Status updated successfully'
    });
  } catch (error) {
    console.error('Error updating conversation feedback status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update status',
      error: error.message
    });
  }
});

// POST /api/v1/feedback/report - Generate feedback analysis report (superAdmin only)
router.post('/report', auth, async (req, res) => {
  try {
    if (req.user.role !== 'superAdmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. SuperAdmin only.'
      });
    }

    const {
      siteFeedbackIds = [],
      conversationFeedbacks = [],
      includeAnalysis = true
    } = req.body;

    // Collect site feedbacks
    let siteFeedbackData = [];
    if (siteFeedbackIds.length > 0) {
      siteFeedbackData = await Feedback.find({ _id: { $in: siteFeedbackIds } })
        .populate('user', 'profile')
        .lean();
    }

    // Build report
    const now = new Date();
    let report = `# Feedback Analysis Report\n\n`;
    report += `**Generated:** ${now.toISOString()}\n`;
    report += `**Generated By:** Admin\n\n`;

    // Statistics
    const totalSite = siteFeedbackData.length;
    const totalConversation = conversationFeedbacks.length;
    const thumbsDownSite = siteFeedbackData.filter(f => f.rating === 'thumbs_down').length;
    const thumbsDownConv = conversationFeedbacks.filter(f => f.rating === 'thumbs_down').length;

    report += `## Summary Statistics\n\n`;
    report += `| Metric | Site Feedback | Conversation Feedback | Total |\n`;
    report += `|--------|---------------|----------------------|-------|\n`;
    report += `| Total Items | ${totalSite} | ${totalConversation} | ${totalSite + totalConversation} |\n`;
    report += `| Thumbs Down | ${thumbsDownSite} | ${thumbsDownConv} | ${thumbsDownSite + thumbsDownConv} |\n`;
    report += `| With Comments | ${siteFeedbackData.filter(f => f.feedbackText).length} | ${conversationFeedbacks.filter(f => f.feedback_text).length} | - |\n\n`;

    // Site Feedback Section
    if (siteFeedbackData.length > 0) {
      report += `## Site Feedback (${siteFeedbackData.length} items)\n\n`;

      // Group by category
      const byCategory = {};
      siteFeedbackData.forEach(f => {
        const cat = f.category || 'general';
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(f);
      });

      report += `### By Category\n\n`;
      Object.entries(byCategory).forEach(([category, items]) => {
        report += `#### ${category} (${items.length})\n\n`;
        items.forEach((item, idx) => {
          report += `**${idx + 1}.** ${item.rating === 'thumbs_up' ? '👍' : '👎'} `;
          report += `Page: \`${item.page || 'N/A'}\`\n`;
          if (item.feedbackText) {
            report += `> ${item.feedbackText}\n`;
          }
          if (item.userProfile?.fitnessLevel) {
            report += `_User: ${item.userProfile.fitnessLevel} level_\n`;
          }
          report += `\n`;
        });
      });
    }

    // Conversation Feedback Section
    if (conversationFeedbacks.length > 0) {
      report += `## Conversation Feedback (${conversationFeedbacks.length} items)\n\n`;

      conversationFeedbacks.forEach((item, idx) => {
        report += `### ${idx + 1}. ${item.rating === 'thumbs_up' ? '👍' : '👎'}\n\n`;
        if (item.question_preview) {
          report += `**User Question:** ${item.question_preview}...\n\n`;
        }
        if (item.answer_preview) {
          report += `**AI Response:** ${item.answer_preview}...\n\n`;
        }
        if (item.feedback_text) {
          report += `**User Feedback:**\n> ${item.feedback_text}\n\n`;
        }
        if (item.userProfile?.fitnessLevel) {
          report += `_User Profile: ${item.userProfile.fitnessLevel} level, Goals: ${item.userProfile.goals?.join(', ') || 'N/A'}_\n\n`;
        }
        report += `---\n\n`;
      });
    }

    // Keyword Analysis
    report += `## Keyword Analysis\n\n`;
    const keywords = ['hallucin', 'wrong', 'incorrect', 'bug', 'error', 'slow', 'confusing',
                      'missing', 'broken', 'crash', 'feature', 'improve', 'workout', 'exercise'];
    const keywordCounts = {};

    const allText = [
      ...siteFeedbackData.map(f => f.feedbackText || ''),
      ...conversationFeedbacks.map(f => f.feedback_text || '')
    ].join(' ').toLowerCase();

    keywords.forEach(kw => {
      const count = (allText.match(new RegExp(kw, 'gi')) || []).length;
      if (count > 0) keywordCounts[kw] = count;
    });

    if (Object.keys(keywordCounts).length > 0) {
      report += `| Keyword | Occurrences |\n`;
      report += `|---------|-------------|\n`;
      Object.entries(keywordCounts)
        .sort((a, b) => b[1] - a[1])
        .forEach(([kw, count]) => {
          report += `| ${kw} | ${count} |\n`;
        });
      report += `\n`;
    } else {
      report += `_No significant keywords found._\n\n`;
    }

    // Recommendations placeholder
    report += `## Recommendations\n\n`;
    report += `_Add your analysis and action items here._\n\n`;
    report += `---\n\n`;
    report += `*Report generated on ${now.toLocaleString()}*\n`;

    res.json({
      success: true,
      data: {
        report,
        stats: {
          totalItems: totalSite + totalConversation,
          siteFeedback: totalSite,
          conversationFeedback: totalConversation,
          thumbsDown: thumbsDownSite + thumbsDownConv,
          keywordCounts
        }
      }
    });
  } catch (error) {
    console.error('Error generating feedback report:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate report',
      error: error.message
    });
  }
});

// PATCH /api/v1/feedback/conversations/bulk - Bulk update conversation feedback status
router.patch('/conversations/bulk', auth, async (req, res) => {
  try {
    if (req.user.role !== 'superAdmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. SuperAdmin only.'
      });
    }

    const { items, status } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'items array is required'
      });
    }

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'status is required'
      });
    }

    const mongoose = require('mongoose');
    const db = mongoose.connection.db;

    const bulkOps = items.map(item => ({
      updateOne: {
        filter: {
          conversationId: item.conversationId,
          messageIndex: parseInt(item.messageIndex)
        },
        update: {
          $set: {
            status,
            updatedAt: new Date(),
            updatedBy: req.user.id
          }
        },
        upsert: true
      }
    }));

    const result = await db.collection('conversationFeedbackStatus').bulkWrite(bulkOps);

    res.json({
      success: true,
      message: `Updated ${result.modifiedCount + result.upsertedCount} feedback items`,
      data: { modifiedCount: result.modifiedCount + result.upsertedCount }
    });
  } catch (error) {
    console.error('Error bulk updating conversation feedback status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to bulk update status',
      error: error.message
    });
  }
});

// POST /api/v1/feedback/analyze - Generate LLM analysis of selected feedbacks (superAdmin only)
router.post('/analyze', auth, async (req, res) => {
  try {
    if (req.user.role !== 'superAdmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. SuperAdmin only.'
      });
    }

    const { siteFeedbacks = [], conversationFeedbacks = [], includeFullConversations = true } = req.body;

    if (siteFeedbacks.length === 0 && conversationFeedbacks.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one feedback item is required'
      });
    }

    // Fetch full conversation context for conversation feedbacks
    const mongoose = require('mongoose');
    const db = mongoose.connection.db;

    let enrichedConversationFeedbacks = conversationFeedbacks;

    if (includeFullConversations && conversationFeedbacks.length > 0) {
      // Get unique conversation IDs
      const conversationIds = [...new Set(conversationFeedbacks.map(f => f.conversation_id).filter(Boolean))];

      // Fetch full conversations
      const conversations = await db.collection('chatConversations').find({
        conversation_id: { $in: conversationIds }
      }).toArray();

      const conversationMap = {};
      conversations.forEach(c => {
        conversationMap[c.conversation_id] = c;
      });

      // Enrich feedbacks with full conversation context
      enrichedConversationFeedbacks = conversationFeedbacks.map(f => {
        const conv = conversationMap[f.conversation_id];
        if (!conv) return f;

        // Get the specific exchange that received feedback
        const messageIndex = f.message_index;
        const messages = conv.messages || [];

        // Get context: previous messages and the rated exchange
        let conversationContext = [];

        // Include up to 3 previous exchanges for context
        const startIndex = Math.max(0, messageIndex - 5);
        for (let i = startIndex; i <= Math.min(messageIndex + 1, messages.length - 1); i++) {
          const msg = messages[i];
          if (msg) {
            conversationContext.push({
              role: msg.role,
              content: msg.content?.substring(0, 1500) || '' // Limit each message to 1500 chars
            });
          }
        }

        return {
          ...f,
          fullConversation: conversationContext,
          conversationTitle: conv.title,
          totalMessagesInConversation: messages.length
        };
      });
    }

    // Build detailed context for LLM
    let feedbackContext = '';

    // Calculate statistics for context
    const totalFeedbacks = siteFeedbacks.length + conversationFeedbacks.length;
    const negativeCount = siteFeedbacks.filter(f => f.rating === 'thumbs_down').length +
                          conversationFeedbacks.filter(f => f.rating === 'thumbs_down').length;
    const positiveCount = totalFeedbacks - negativeCount;

    feedbackContext += `# Feedback Dataset Overview\n`;
    feedbackContext += `- **Total Feedbacks:** ${totalFeedbacks}\n`;
    feedbackContext += `- **Negative (Thumbs Down):** ${negativeCount} (${Math.round(negativeCount/totalFeedbacks*100)}%)\n`;
    feedbackContext += `- **Positive (Thumbs Up):** ${positiveCount} (${Math.round(positiveCount/totalFeedbacks*100)}%)\n`;
    feedbackContext += `- **Site Feedbacks:** ${siteFeedbacks.length}\n`;
    feedbackContext += `- **AI Conversation Feedbacks:** ${conversationFeedbacks.length}\n\n`;

    if (siteFeedbacks.length > 0) {
      feedbackContext += '---\n\n# Site Feedback Details\n\n';
      siteFeedbacks.forEach((f, i) => {
        feedbackContext += `### Feedback #${i + 1} [${f.rating === 'thumbs_up' ? '👍 POSITIVE' : '👎 NEGATIVE'}]\n`;
        feedbackContext += `- **Category:** ${f.category || 'general'}\n`;
        feedbackContext += `- **Page:** ${f.page || 'N/A'}\n`;
        feedbackContext += `- **Date:** ${f.createdAt ? new Date(f.createdAt).toLocaleDateString() : 'N/A'}\n`;
        if (f.userProfile) {
          feedbackContext += `- **User Profile:** ${f.userProfile.fitnessLevel || 'Unknown'} level`;
          if (f.userProfile.goals?.length) {
            feedbackContext += `, Goals: ${f.userProfile.goals.join(', ')}`;
          }
          feedbackContext += '\n';
        }
        if (f.feedbackText) {
          feedbackContext += `- **User Comment:**\n  > "${f.feedbackText}"\n`;
        } else {
          feedbackContext += `- **User Comment:** (No comment provided)\n`;
        }
        feedbackContext += '\n';
      });
    }

    if (enrichedConversationFeedbacks.length > 0) {
      feedbackContext += '---\n\n# AI Conversation Feedback Details\n\n';
      enrichedConversationFeedbacks.forEach((f, i) => {
        const feedbackRef = `CF-${i + 1}`; // Conversation Feedback reference
        feedbackContext += `### Conversation Feedback #${i + 1} (Ref: ${feedbackRef}) [${f.rating === 'thumbs_up' ? '👍 POSITIVE' : '👎 NEGATIVE'}]\n`;
        feedbackContext += `- **Reference ID:** \`${feedbackRef}\`\n`;
        if (f.conversation_id) {
          feedbackContext += `- **Conversation ID:** \`${f.conversation_id}\`\n`;
        }
        feedbackContext += `- **Date:** ${f.timestamp ? new Date(f.timestamp).toLocaleDateString() : 'N/A'}\n`;
        if (f.conversationTitle) {
          feedbackContext += `- **Conversation Topic:** "${f.conversationTitle}"\n`;
        }
        if (f.totalMessagesInConversation) {
          feedbackContext += `- **Conversation Length:** ${f.totalMessagesInConversation} messages (feedback on message #${f.message_index || 'N/A'})\n`;
        }
        if (f.userProfile) {
          feedbackContext += `- **User Profile:** ${f.userProfile.fitnessLevel || 'Unknown'} level`;
          if (f.userProfile.goals?.length) {
            feedbackContext += `, Goals: ${f.userProfile.goals.join(', ')}`;
          }
          if (f.userProfile.sportPreferences?.length) {
            feedbackContext += `, Sports: ${f.userProfile.sportPreferences.join(', ')}`;
          }
          feedbackContext += '\n';
        }

        // Include full conversation context if available
        if (f.fullConversation && f.fullConversation.length > 0) {
          feedbackContext += `\n#### Full Conversation Context (leading up to the rated response):\n\n`;
          feedbackContext += '```\n';
          f.fullConversation.forEach((msg) => {
            const role = msg.role === 'user' ? '👤 USER' : '🤖 SENSEI';
            feedbackContext += `${role}:\n${msg.content}\n\n`;
          });
          feedbackContext += '```\n\n';
          feedbackContext += `**⬆️ The user gave ${f.rating === 'thumbs_up' ? '👍 POSITIVE' : '👎 NEGATIVE'} feedback to the last AI response above.**\n`;
        } else {
          // Fallback to preview if full conversation not available
          if (f.question_preview) {
            feedbackContext += `- **User Asked:**\n  > "${f.question_preview}"\n`;
          }
          if (f.answer_preview) {
            feedbackContext += `- **AI Responded:**\n  > "${f.answer_preview}"\n`;
          }
        }

        if (f.feedback_text) {
          feedbackContext += `\n- **User's Written Feedback:**\n  > "${f.feedback_text}"\n`;
        } else {
          feedbackContext += `\n- **User's Written Feedback:** (No comment provided - just thumbs ${f.rating === 'thumbs_up' ? 'up' : 'down'})\n`;
        }
        feedbackContext += '\n---\n\n';
      });
    }

    const systemPrompt = `You are a senior product analyst and UX researcher for **Torii**, a fitness coaching app with an AI assistant called "Sensei". Your role is to analyze user feedback and produce comprehensive, actionable reports that drive product improvements.

## Your Analysis Framework

You must produce a detailed, well-structured report using the following sections. Be thorough, specific, and reference actual feedback items by their numbers.

### Report Structure:

## 1. Executive Summary
Write 3-4 sentences summarizing the overall sentiment, the most critical finding, and the primary recommendation.

## 2. Quantitative Overview
- Breakdown of positive vs negative feedback
- Distribution by category/type
- Any notable patterns in user segments (fitness level, goals)

## 3. Recurring Issues (CRITICAL)
**This is the most important section.** Identify issues that appear multiple times across different feedback items. For each recurring issue:
- **Issue Name:** Clear, descriptive title
- **Frequency:** How many feedback items mention this (with item numbers)
- **Severity:** Critical / High / Medium / Low
- **User Impact:** How this affects the user experience
- **Example Quotes:** Direct quotes from feedback
- **Root Cause Hypothesis:** Why this might be happening

## 4. New/Unique Issues
Issues that appear only once but are worth noting. Include:
- Description of the issue
- Which feedback item(s) it came from
- Potential impact if not addressed

## 5. AI Coach (Sensei) Specific Analysis
If there are conversation feedbacks, provide detailed analysis:
- **Understanding Issues:** Where the AI misunderstood user intent
- **Response Quality Issues:** Where responses were unhelpful or incorrect
- **Behavioral Issues:** Actions the AI took that frustrated users
- **Missing Capabilities:** What users expected but the AI couldn't do
- **Specific Prompt/Training Improvements:** Concrete suggestions for improving the AI

## 6. Positive Patterns & What's Working
- What users appreciate
- Features getting positive feedback
- Successful interactions worth replicating

## 7. Actionable Recommendations
Provide specific, implementable recommendations organized by:

### 🔥 Immediate Actions (This Week)
Quick fixes that can address critical issues

### 📅 Short-term Improvements (Next 2 Weeks)
Medium-effort improvements

### 🎯 Strategic Initiatives (Next Month+)
Larger improvements requiring planning

For each recommendation:
- Clear description of what to do
- Which issue(s) it addresses
- Expected impact
- Implementation complexity (Low/Medium/High)

## 8. Metrics to Track
Suggest KPIs to monitor improvement after implementing changes.

---

## Guidelines:
- Be specific - reference feedback items by number (e.g., "Feedback #3 mentions...")
- Use direct quotes from user feedback to support your points
- Don't be generic - provide actionable, specific recommendations
- If feedback is ambiguous, note it and provide your best interpretation
- Consider the user's fitness level and goals when analyzing their feedback
- For AI issues, suggest specific prompt improvements or behavioral changes
- Use markdown formatting: headers, bullet points, bold for emphasis, blockquotes for user quotes`;

    const userPrompt = `Please analyze the following ${totalFeedbacks} feedback items and produce a comprehensive analysis report following the structure in your instructions.

${feedbackContext}

---

Remember to:
1. Identify ALL recurring issues (issues mentioned in 2+ feedbacks)
2. Reference specific feedback numbers
3. Quote users directly
4. Provide concrete, actionable recommendations
5. Be thorough - this report will drive product decisions`;

    // Use GPT-4o (OpenAI's most capable model) for feedback analysis - hardcoded for quality
    const feedbackModel = 'gpt-4o';

    const completion = await openai.chat.completions.create({
      model: feedbackModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.5, // Lower temperature for more consistent, analytical output
      max_tokens: 8000  // Increased for longer, more detailed reports
    });

    const analysis = completion.choices[0].message.content;

    res.json({
      success: true,
      data: {
        analysis,
        stats: {
          totalFeedbacks,
          siteFeedbacks: siteFeedbacks.length,
          conversationFeedbacks: conversationFeedbacks.length,
          thumbsDown: negativeCount,
          thumbsUp: positiveCount,
          negativeRate: Math.round(negativeCount/totalFeedbacks*100)
        },
        model: feedbackModel,
        tokens: completion.usage?.total_tokens || 0
      }
    });
  } catch (error) {
    console.error('Error generating feedback analysis:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate analysis',
      error: error.message
    });
  }
});

// GET /api/v1/feedback/conversation/:conversationId - Get full conversation (superAdmin only)
router.get('/conversation/:conversationId', auth, async (req, res) => {
  try {
    if (req.user.role !== 'superAdmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. SuperAdmin only.'
      });
    }

    const { conversationId } = req.params;
    const mongoose = require('mongoose');
    const db = mongoose.connection.db;

    const conversation = await db.collection('chatConversations').findOne({
      conversation_id: conversationId
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    // Get user profile info
    let userProfile = null;
    if (conversation.metadata?.user_id) {
      const user = await User.findById(conversation.metadata.user_id)
        .select('profile')
        .lean();
      if (user) {
        userProfile = {
          fitnessLevel: user.profile?.fitnessLevel,
          goals: user.profile?.goals || [],
          sportPreferences: user.profile?.sportPreferences || [],
          injuries: user.profile?.injuries || []
        };
      }
    }

    res.json({
      success: true,
      data: {
        conversation_id: conversation.conversation_id,
        title: conversation.title,
        messages: conversation.messages || [],
        feedback: conversation.feedback || [],
        metadata: {
          created_at: conversation.created_at,
          updated_at: conversation.updated_at
        },
        userProfile
      }
    });
  } catch (error) {
    console.error('Error fetching conversation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch conversation',
      error: error.message
    });
  }
});

module.exports = router;
