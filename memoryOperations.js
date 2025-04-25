const db = require('./dbConfig');
const { v4: uuidv4 } = require('uuid');

// Memory operations class
class MemoryOperations {
  // Create a new experience
  async createExperience(experienceData) {
    try {
      // Generate a unique experience_id if not provided
      if (!experienceData.experience_id) {
        experienceData.experience_id = `exp_${uuidv4().substring(0, 8)}`;
      }
      
      // Format the metadata as JSON if it's an object
      if (experienceData.metadata && typeof experienceData.metadata === 'object') {
        experienceData.metadata = JSON.stringify(experienceData.metadata);
      }
      
      // Extract tags if they are provided
      const tags = experienceData.tags || [];
      delete experienceData.tags;
      
      // Insert experience and get the ID
      const [experienceId] = await db('Experiences').insert(experienceData);
      
      // Add tags if provided
      if (tags.length > 0) {
        const tagInserts = tags.map(tag => ({
          experience_id: experienceId,
          tag
        }));
        await db('ExperienceTags').insert(tagInserts);
      }
      
      // Return the created experience
      return {
        id: experienceId,
        experience_id: experienceData.experience_id,
        ...experienceData
      };
    } catch (error) {
      console.error('Error creating experience:', error);
      throw error;
    }
  }
  
  // Get an experience by its ID
  async getExperienceById(id) {
    try {
      // Get the experience
      const experience = await db('Experiences').where('id', id).first();
      
      if (!experience) {
        return null;
      }
      
      // Get tags for this experience
      const tags = await db('ExperienceTags')
        .where('experience_id', id)
        .select('tag');
      
      // Parse metadata if it exists
      if (experience.metadata) {
        try {
          experience.metadata = JSON.parse(experience.metadata);
        } catch (e) {
          console.warn('Failed to parse metadata for experience:', id);
        }
      }
      
      // Add tags to the experience
      experience.tags = tags.map(t => t.tag);
      
      return experience;
    } catch (error) {
      console.error(`Error getting experience with id ${id}:`, error);
      throw error;
    }
  }
  
  // Get an experience by its experience_id
  async getExperienceByExperienceId(experienceId) {
    try {
      // Get the experience
      const experience = await db('Experiences').where('experience_id', experienceId).first();
      
      if (!experience) {
        return null;
      }
      
      // Get the internal ID
      const id = experience.id;
      
      // Get tags for this experience
      const tags = await db('ExperienceTags')
        .where('experience_id', id)
        .select('tag');
      
      // Parse metadata if it exists
      if (experience.metadata) {
        try {
          experience.metadata = JSON.parse(experience.metadata);
        } catch (e) {
          console.warn('Failed to parse metadata for experience:', experienceId);
        }
      }
      
      // Add tags to the experience
      experience.tags = tags.map(t => t.tag);
      
      return experience;
    } catch (error) {
      console.error(`Error getting experience with experience_id ${experienceId}:`, error);
      throw error;
    }
  }
  
  // Update an experience
  async updateExperience(id, experienceData) {
    try {
      // Format the metadata as JSON if it's an object
      if (experienceData.metadata && typeof experienceData.metadata === 'object') {
        experienceData.metadata = JSON.stringify(experienceData.metadata);
      }
      
      // Set updated timestamp
      experienceData.updated_at = db.fn.now();
      
      // Extract tags if they are provided
      const tags = experienceData.tags || [];
      delete experienceData.tags;
      
      // Update the experience
      await db('Experiences').where('id', id).update(experienceData);
      
      // Update tags if provided
      if (tags.length > 0) {
        // Delete existing tags
        await db('ExperienceTags').where('experience_id', id).delete();
        
        // Insert new tags
        const tagInserts = tags.map(tag => ({
          experience_id: id,
          tag
        }));
        await db('ExperienceTags').insert(tagInserts);
      }
      
      // Return the updated experience
      return this.getExperienceById(id);
    } catch (error) {
      console.error(`Error updating experience with id ${id}:`, error);
      throw error;
    }
  }
  
  // Delete an experience
  async deleteExperience(id) {
    try {
      // The foreign key constraints will automatically delete related tags and relations
      const numDeleted = await db('Experiences').where('id', id).delete();
      return numDeleted > 0;
    } catch (error) {
      console.error(`Error deleting experience with id ${id}:`, error);
      throw error;
    }
  }
  
  // Search experiences by text or tags
  async searchExperiences(query, options = {}) {
    try {
      const { tags = [], limit = 10, offset = 0, sortBy = 'created_at', sortOrder = 'desc' } = options;
      
      // Start with the base query
      let experiencesQuery = db('Experiences')
        .select('Experiences.*')
        .distinct();
      
      // Add text search if query is provided
      if (query) {
        experiencesQuery = experiencesQuery.where(function() {
          this.where('title', 'like', `%${query}%`)
            .orWhere('description', 'like', `%${query}%`)
            .orWhere('context', 'like', `%${query}%`);
        });
      }
      
      // Add tag filtering if tags are provided
      if (tags.length > 0) {
        experiencesQuery = experiencesQuery
          .join('ExperienceTags', 'Experiences.id', 'ExperienceTags.experience_id')
          .whereIn('ExperienceTags.tag', tags);
      }
      
      // Add sorting and pagination
      experiencesQuery = experiencesQuery
        .orderBy(sortBy, sortOrder)
        .limit(limit)
        .offset(offset);
      
      // Execute the query
      const experiences = await experiencesQuery;
      
      // Get tags for all experiences
      const experienceIds = experiences.map(exp => exp.id);
      
      if (experienceIds.length > 0) {
        const allTags = await db('ExperienceTags')
          .whereIn('experience_id', experienceIds)
          .select('experience_id', 'tag');
        
        // Group tags by experience_id
        const tagsByExperienceId = {};
        allTags.forEach(({ experience_id, tag }) => {
          if (!tagsByExperienceId[experience_id]) {
            tagsByExperienceId[experience_id] = [];
          }
          tagsByExperienceId[experience_id].push(tag);
        });
        
        // Add tags to each experience and parse metadata
        experiences.forEach(experience => {
          experience.tags = tagsByExperienceId[experience.id] || [];
          if (experience.metadata) {
            try {
              experience.metadata = JSON.parse(experience.metadata);
            } catch (e) {
              console.warn('Failed to parse metadata for experience:', experience.id);
            }
          }
        });
      }
      
      return experiences;
    } catch (error) {
      console.error('Error searching experiences:', error);
      throw error;
    }
  }
  
  // Create a relation between two experiences
  async createRelation(sourceId, targetId, relationType, strength = 1.0) {
    try {
      const [relationId] = await db('ExperienceRelations').insert({
        source_id: sourceId,
        target_id: targetId,
        relation_type: relationType,
        strength
      });
      
      return relationId;
    } catch (error) {
      console.error('Error creating relation:', error);
      throw error;
    }
  }
  
  // Get related experiences
  async getRelatedExperiences(experienceId, relationType = null) {
    try {
      // Get experiences related to this experience
      let query = db('ExperienceRelations')
        .join('Experiences', 'ExperienceRelations.target_id', 'Experiences.id')
        .where('ExperienceRelations.source_id', experienceId)
        .select(
          'Experiences.*',
          'ExperienceRelations.relation_type',
          'ExperienceRelations.strength'
        );
      
      // Filter by relation type if specified
      if (relationType) {
        query = query.where('ExperienceRelations.relation_type', relationType);
      }
      
      // Execute the query
      const relatedExperiences = await query;
      
      // Get tags for all related experiences
      const experienceIds = relatedExperiences.map(exp => exp.id);
      
      if (experienceIds.length > 0) {
        const allTags = await db('ExperienceTags')
          .whereIn('experience_id', experienceIds)
          .select('experience_id', 'tag');
        
        // Group tags by experience_id
        const tagsByExperienceId = {};
        allTags.forEach(({ experience_id, tag }) => {
          if (!tagsByExperienceId[experience_id]) {
            tagsByExperienceId[experience_id] = [];
          }
          tagsByExperienceId[experience_id].push(tag);
        });
        
        // Add tags to each experience and parse metadata
        relatedExperiences.forEach(experience => {
          experience.tags = tagsByExperienceId[experience.id] || [];
          if (experience.metadata) {
            try {
              experience.metadata = JSON.parse(experience.metadata);
            } catch (e) {
              console.warn('Failed to parse metadata for experience:', experience.id);
            }
          }
        });
      }
      
      return relatedExperiences;
    } catch (error) {
      console.error(`Error getting related experiences for ${experienceId}:`, error);
      throw error;
    }
  }
  
  // Link an experience to a conversation
  async linkExperienceToConversation(experienceId, conversationId) {
    try {
      await db('MemoryConversations').insert({
        experience_id: experienceId,
        conversation_id: conversationId
      });
      
      return true;
    } catch (error) {
      console.error('Error linking experience to conversation:', error);
      throw error;
    }
  }
  
  // Get experiences linked to a conversation
  async getExperiencesForConversation(conversationId) {
    try {
      const experiences = await db('MemoryConversations')
        .join('Experiences', 'MemoryConversations.experience_id', 'Experiences.id')
        .where('MemoryConversations.conversation_id', conversationId)
        .select('Experiences.*');
      
      // Get tags for all experiences
      const experienceIds = experiences.map(exp => exp.id);
      
      if (experienceIds.length > 0) {
        const allTags = await db('ExperienceTags')
          .whereIn('experience_id', experienceIds)
          .select('experience_id', 'tag');
        
        // Group tags by experience_id
        const tagsByExperienceId = {};
        allTags.forEach(({ experience_id, tag }) => {
          if (!tagsByExperienceId[experience_id]) {
            tagsByExperienceId[experience_id] = [];
          }
          tagsByExperienceId[experience_id].push(tag);
        });
        
        // Add tags to each experience and parse metadata
        experiences.forEach(experience => {
          experience.tags = tagsByExperienceId[experience.id] || [];
          if (experience.metadata) {
            try {
              experience.metadata = JSON.parse(experience.metadata);
            } catch (e) {
              console.warn('Failed to parse metadata for experience:', experience.id);
            }
          }
        });
      }
      
      return experiences;
    } catch (error) {
      console.error(`Error getting experiences for conversation ${conversationId}:`, error);
      throw error;
    }
  }
}

module.exports = new MemoryOperations(); 