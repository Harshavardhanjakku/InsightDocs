const { v4: uuidv4 } = require('uuid');

class OperationalTransform {
  constructor() {
    this.operations = new Map();
  }

  // Create a proper text operation
  createOperation(type, position, text, length = 0, timestamp = Date.now()) {
    return {
      id: uuidv4(),
      type,
      position,
      text: text || '',
      length,
      timestamp
    };
  }

  // Transform operation A against operation B
  transform(opA, opB) {
    if (opA.type === 'insert' && opB.type === 'insert') {
      return this.transformInsertInsert(opA, opB);
    } else if (opA.type === 'insert' && opB.type === 'delete') {
      return this.transformInsertDelete(opA, opB);
    } else if (opA.type === 'delete' && opB.type === 'insert') {
      return this.transformDeleteInsert(opA, opB);
    } else if (opA.type === 'delete' && opB.type === 'delete') {
      return this.transformDeleteDelete(opA, opB);
    }
    return opA;
  }

  // Transform operation against a list of operations
  transformAgainstOperations(operation, operations) {
    let transformedOp = { ...operation };
    
    for (const existingOp of operations) {
      transformedOp = this.transform(transformedOp, existingOp);
    }
    
    return transformedOp;
  }

  // Transform insert vs insert
  transformInsertInsert(opA, opB) {
    if (opA.position < opB.position) {
      return opA;
    } else if (opA.position > opB.position) {
      return {
        ...opA,
        position: opA.position + opB.text.length
      };
    } else {
      // Same position, use timestamp to break tie
      return opA.timestamp < opB.timestamp ? opA : {
        ...opA,
        position: opA.position + opB.text.length
      };
    }
  }

  // Transform insert vs delete
  transformInsertDelete(opA, opB) {
    if (opA.position <= opB.position) {
      return opA;
    } else if (opA.position > opB.position + opB.length) {
      return {
        ...opA,
        position: opA.position - opB.length
      };
    } else {
      // Insert position is within deleted range
      return {
        ...opA,
        position: opB.position
      };
    }
  }

  // Transform delete vs insert
  transformDeleteInsert(opA, opB) {
    if (opA.position < opB.position) {
      return opA;
    } else {
      return {
        ...opA,
        position: opA.position + opB.text.length
      };
    }
  }

  // Transform delete vs delete
  transformDeleteDelete(opA, opB) {
    const aStart = opA.position;
    const aEnd = opA.position + opA.length;
    const bStart = opB.position;
    const bEnd = opB.position + opB.length;

    if (aEnd <= bStart) {
      return opA;
    } else if (bEnd <= aStart) {
      return {
        ...opA,
        position: opA.position - opB.length
      };
    } else {
      // Overlapping deletions
      const newStart = Math.min(aStart, bStart);
      const newEnd = Math.max(aEnd, bEnd);
      return {
        ...opA,
        position: newStart,
        length: newEnd - newStart
      };
    }
  }

  // NEW METHOD: Apply operation to text content
  applyOperation(content, operation) {
    try {
      let newContent = content;
      
      switch (operation.type) {
        case 'insert':
          newContent = content.slice(0, operation.position) + 
                      operation.text + 
                      content.slice(operation.position);
          break;
        case 'delete':
          newContent = content.slice(0, operation.position) + 
                      content.slice(operation.position + operation.length);
          break;
        case 'replace':
          newContent = content.slice(0, operation.position) + 
                      operation.text + 
                      content.slice(operation.position + operation.length);
          break;
        default:
          console.log(`⚠️ Unknown operation type: ${operation.type}`);
          return content;
      }
      
      return newContent;
    } catch (error) {
      console.error('❌ Error applying operation to content:', error.message);
      return content;
    }
  }

  // NEW METHOD: Create operation from Quill delta
  createOperationFromDelta(delta, baseLength) {
    try {
      const operations = [];
      let position = 0;
      
      for (const op of delta.ops) {
        if (op.insert) {
          // Insert operation
          operations.push(this.createOperation('insert', position, op.insert));
          position += op.insert.length;
        } else if (op.delete) {
          // Delete operation
          operations.push(this.createOperation('delete', position, '', op.delete));
          // Don't update position for delete operations
        } else if (op.retain) {
          // Retain operation - just move position
          position += op.retain;
        }
      }
      
      return operations;
    } catch (error) {
      console.error('❌ Error creating operation from delta:', error.message);
      return [];
    }
  }

  // NEW METHOD: Merge operations for better performance
  mergeOperations(operations) {
    try {
      if (operations.length <= 1) return operations;
      
      const merged = [];
      let current = { ...operations[0] };
      
      for (let i = 1; i < operations.length; i++) {
        const next = operations[i];
        
        // Try to merge consecutive operations of the same type
        if (current.type === next.type && 
            current.type === 'insert' && 
            current.position + current.text.length === next.position) {
          // Merge consecutive inserts
          current.text += next.text;
        } else if (current.type === next.type && 
                   current.type === 'delete' && 
                   current.position === next.position) {
          // Merge consecutive deletes
          current.length += next.length;
        } else {
          // Can't merge, add current to result and start new
          merged.push(current);
          current = { ...next };
        }
      }
      
      merged.push(current);
      return merged;
    } catch (error) {
      console.error('❌ Error merging operations:', error.message);
      return operations;
    }
  }

  // NEW METHOD: Validate operation
  validateOperation(operation, contentLength) {
    try {
      if (!operation || typeof operation !== 'object') {
        return false;
      }
      
      if (!['insert', 'delete', 'replace'].includes(operation.type)) {
        return false;
      }
      
      if (typeof operation.position !== 'number' || operation.position < 0) {
        return false;
      }
      
      if (operation.position > contentLength) {
        return false;
      }
      
      if (operation.type === 'insert' && typeof operation.text !== 'string') {
        return false;
      }
      
      if (operation.type === 'delete' && typeof operation.length !== 'number') {
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('❌ Error validating operation:', error.message);
      return false;
    }
  }
}

module.exports = OperationalTransform;
