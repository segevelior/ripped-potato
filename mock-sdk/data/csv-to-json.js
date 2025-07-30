#!/usr/bin/env node

// CSV to JSON converter for Base44 data
// Usage: node csv-to-json.js <entity-name> < data.csv > data.json

import { readFileSync, writeFileSync } from 'fs';
import { parse } from 'csv-parse/sync';

function convertCsvToJson(csvContent, entityName) {
  // Parse CSV
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });
  
  // Transform records based on entity type
  const transformed = records.map(record => {
    // Clean up empty strings to null
    Object.keys(record).forEach(key => {
      if (record[key] === '') {
        record[key] = null;
      }
    });
    
    // Parse JSON fields if they exist
    const jsonFields = ['strain', 'exercises', 'muscles', 'discipline', 'equipment', 'similar_exercises', 'prerequisites', 'next_progression', 'previous_progression', 'sets', 'linked_goals', 'linked_workouts', 'progress_metrics', 'settings', 'tags', 'affected_regions', 'muscle_groups'];
    
    jsonFields.forEach(field => {
      if (record[field] && typeof record[field] === 'string') {
        try {
          record[field] = JSON.parse(record[field]);
        } catch (e) {
          // If it's not valid JSON, try splitting by comma for arrays
          if (record[field].includes(',')) {
            record[field] = record[field].split(',').map(s => s.trim());
          }
        }
      }
    });
    
    // Map Base44 field names to our schema
    if (entityName === 'Exercise') {
      // Map muscle_groups to muscles
      if (record.muscle_groups) {
        record.muscles = record.muscle_groups;
        delete record.muscle_groups;
      }
      // Map modality to equipment/discipline
      if (record.modality) {
        record.discipline = [record.modality];
        if (record.modality === 'bodyweight') {
          record.equipment = [];
        }
        delete record.modality;
      }
      // Create strain object from strain_rating
      if (record.strain_rating) {
        record.strain = {
          intensity: record.strain_rating > 7 ? 'high' : record.strain_rating > 4 ? 'moderate' : 'low',
          load: record.modality === 'bodyweight' ? 'bodyweight' : 'moderate',
          duration_type: 'reps'
        };
        delete record.strain_rating;
      }
    }
    
    // Parse numeric fields
    const numericFields = ['progression_level', 'duration_minutes', 'total_strain', 'strain_rating', 'estimated_weeks', 'distance_km', 'elevation_gain_m'];
    numericFields.forEach(field => {
      if (record[field]) {
        record[field] = parseFloat(record[field]);
      }
    });
    
    // Parse boolean fields
    const booleanFields = ['is_completed', 'auto_schedule', 'notification_enabled'];
    booleanFields.forEach(field => {
      if (record[field] !== undefined && record[field] !== null) {
        record[field] = record[field] === 'true' || record[field] === '1';
      }
    });
    
    // Parse date fields
    const dateFields = ['date', 'start_date', 'end_date', 'scheduled_date', 'completion_date'];
    dateFields.forEach(field => {
      if (record[field]) {
        try {
          record[field] = new Date(record[field]).toISOString();
        } catch (e) {
          // Keep original value if date parsing fails
        }
      }
    });
    
    // Add timestamps if not present
    if (!record.createdAt) {
      record.createdAt = new Date().toISOString();
    }
    if (!record.updatedAt) {
      record.updatedAt = record.createdAt;
    }
    
    // Generate ID if not present
    if (!record.id) {
      record.id = `${entityName.toLowerCase()}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    
    return record;
  });
  
  return transformed;
}

// CLI usage
if (process.argv.length > 2) {
  const entityName = process.argv[2];
  const csvContent = readFileSync(0, 'utf-8'); // Read from stdin
  const jsonData = convertCsvToJson(csvContent, entityName);
  console.log(JSON.stringify(jsonData, null, 2));
} else {
  console.error('Usage: node csv-to-json.js <entity-name> < data.csv > data.json');
  process.exit(1);
}

export { convertCsvToJson };