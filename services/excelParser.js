const XLSX = require('xlsx');

class BankStatementExcelParser {
  constructor() {
    // Payment method patterns for different transaction types
    this.paymentMethodPatterns = {
      'UPI': /UPI|paytm|gpay|phonepe|bhim|@|\/pay/i,
      'Card': /card|visa|mastercard|atm|pos/i,
      'Bank': /neft|rtgs|imps|transfer|cheque|chq|tfr/i,
      'Cash': /cash|withdrawal|wd/i
    };

    // Category patterns for intelligent categorization
    this.categoryPatterns = {
      'Food & Dining': /restaurant|food|cafe|pizza|burger|swiggy|zomato|dominos|mcdonald|kfc|subway|dining/i,
      'Transportation': /uber|ola|taxi|petrol|diesel|fuel|transport|bus|train|metro|parking/i,
      'Shopping': /amazon|flipkart|myntra|shopping|mall|store|purchase|buy|shop/i,
      'Entertainment': /movie|cinema|netflix|spotify|game|entertainment|ticket|concert/i,
      'Utilities': /electricity|water|gas|internet|mobile|phone|bill|recharge/i,
      'Healthcare': /hospital|doctor|medical|pharmacy|health|medicine|clinic/i,
      'Education': /school|college|university|education|course|book|tuition/i,
      'Groceries': /grocery|supermarket|mart|vegetable|fruit|milk|bread/i,
      'ATM Withdrawal': /atm|withdrawal|cash/i,
      'Bank Charges': /charge|fee|penalty|interest|maintenance/i
    };

    // Common column headers that might contain dates
    this.dateHeaders = ['date', 'transaction date', 'value date', 'posting date', 'txn date'];
    
    // Common column headers that might contain descriptions
    this.descriptionHeaders = ['description', 'particulars', 'narration', 'transaction details', 'remarks'];
    
    // Common column headers that might contain amounts
    this.amountHeaders = ['amount', 'debit', 'withdrawal', 'withdrawals', 'dr'];
    
    // Common column headers that might contain transaction types
    this.typeHeaders = ['type', 'dr/cr', 'transaction type', 'tran type'];
  }

  /**
   * Parse Excel buffer and extract withdrawal transactions
   */
  async parseBankStatement(excelBuffer) {
    try {
      const workbook = XLSX.read(excelBuffer, { type: 'buffer' });
      
      // Get the first worksheet
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      // Convert to JSON
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
        header: 1, // Use array of arrays format first to detect headers
        defval: '' // Default value for empty cells
      });
      
      console.log('Excel sheet preview (first 5 rows):', jsonData.slice(0, 5));
      
      // Detect header row and column mapping
      const columnMapping = this.detectColumns(jsonData);
      console.log('Detected column mapping:', columnMapping);
      
      // Convert to objects using detected headers
      const transactions = this.extractTransactions(jsonData, columnMapping);
      const filteredTransactions = this.filterWithdrawals(transactions);
      
      console.log(`Extracted ${transactions.length} total transactions, ${filteredTransactions.length} withdrawals`);
      
      return filteredTransactions;
    } catch (error) {
      console.error('Error parsing Excel file:', error);
      throw new Error('Failed to parse bank statement Excel file');
    }
  }

  /**
   * Detect which columns contain which data types
   */
  detectColumns(jsonData) {
    const mapping = {
      dateColumn: -1,
      descriptionColumn: -1,
      amountColumn: -1,
      typeColumn: -1,
      headerRow: -1
    };

    // Look for header row (usually contains text like "Date", "Description", etc.)
    for (let rowIndex = 0; rowIndex < Math.min(10, jsonData.length); rowIndex++) {
      const row = jsonData[rowIndex];
      if (!row || row.length === 0) continue;

      let headerScore = 0;

      for (let colIndex = 0; colIndex < row.length; colIndex++) {
        const cellValue = String(row[colIndex]).toLowerCase().trim();

        // Exact header name matching
        if (cellValue === 'date') mapping.dateColumn = colIndex;
        if (cellValue === 'particulars' || cellValue === 'narration') mapping.descriptionColumn = colIndex;
        if (cellValue === 'withdrawals' || cellValue === 'debit' || cellValue === 'dr') mapping.amountColumn = colIndex;
        if (cellValue === 'dr/cr' || cellValue === 'type' || cellValue === 'tran type') mapping.typeColumn = colIndex;

        // Fuzzy matching fallback
        if (mapping.dateColumn === -1 && this.dateHeaders.some(h => cellValue.includes(h))) mapping.dateColumn = colIndex;
        if (mapping.descriptionColumn === -1 && this.descriptionHeaders.some(h => cellValue.includes(h))) mapping.descriptionColumn = colIndex;
        if (mapping.amountColumn === -1 && this.amountHeaders.some(h => cellValue.includes(h))) mapping.amountColumn = colIndex;
        if (mapping.typeColumn === -1 && this.typeHeaders.some(h => cellValue.includes(h))) mapping.typeColumn = colIndex;
      }

      // If we found at least 2 headers, this is likely the header row
      const foundHeaders = [mapping.dateColumn, mapping.descriptionColumn, mapping.amountColumn, mapping.typeColumn].filter(i => i !== -1).length;
      if (foundHeaders >= 2) {
        mapping.headerRow = rowIndex;
        break;
      }
    }

    // If we couldn't detect headers automatically, make educated guesses
    if (mapping.headerRow === -1) {
      mapping.headerRow = 0; // Assume first row has headers
      // Fallback: use column index by header name if present
      const headerRow = jsonData[0] || [];
      headerRow.forEach((cell, idx) => {
        const cellValue = String(cell).toLowerCase().trim();
        if (cellValue === 'date') mapping.dateColumn = idx;
        if (cellValue === 'particulars' || cellValue === 'narration') mapping.descriptionColumn = idx;
        if (cellValue === 'withdrawals' || cellValue === 'debit' || cellValue === 'dr') mapping.amountColumn = idx;
        if (cellValue === 'dr/cr' || cellValue === 'type' || cellValue === 'tran type') mapping.typeColumn = idx;
      });
    }

    return mapping;
  }

  /**
   * Extract transactions from the JSON data using column mapping
   */
  extractTransactions(jsonData, columnMapping) {
    const transactions = [];
    const startRow = columnMapping.headerRow + 1;

    for (let rowIndex = startRow; rowIndex < jsonData.length; rowIndex++) {
      const row = jsonData[rowIndex];
      if (!row || row.length === 0) continue;

      try {
        // Extract data from mapped columns
        const dateValue = row[columnMapping.dateColumn];
        const descriptionValue = row[columnMapping.descriptionColumn];
        const amountValue = row[columnMapping.amountColumn];
        const typeValue = row[columnMapping.typeColumn];

        // Skip rows with missing essential data
        if (!dateValue || !amountValue) continue;

        // Parse the data
        const date = this.parseDate(dateValue);
        const description = this.cleanDescription(descriptionValue);
        const amount = this.parseAmount(amountValue);
        
        // Determine if this is a withdrawal/debit
        const isWithdrawal = this.isWithdrawal(typeValue, amountValue, description);
        
        if (isWithdrawal && amount > 0) {
          const transaction = {
            date: date,
            description: description,
            amount: amount,
            paymentMethod: this.determinePaymentMethod(description),
            suggestedCategory: this.suggestCategory(description),
            type: 'withdrawal',
            rawData: {
              date: dateValue,
              description: descriptionValue,
              amount: amountValue,
              type: typeValue
            }
          };

          transactions.push(transaction);
        }
      } catch (error) {
        console.log(`Error parsing row ${rowIndex}:`, error.message);
      }
    }

    return transactions;
  }

  /**
   * Determine if a transaction is a withdrawal/expense
   */
  isWithdrawal(typeValue, amountValue, description) {
    const typeStr = String(typeValue || '').toLowerCase();
    const descStr = String(description || '').toLowerCase();
    
    // Check type column first
    if (typeStr.includes('dr') || typeStr.includes('debit')) {
      return true;
    }
    if (typeStr.includes('cr') || typeStr.includes('credit')) {
      return false;
    }
    
    // Check for negative amounts (some formats use negative for debits)
    const amountStr = String(amountValue || '');
    if (amountStr.includes('-')) {
      return true;
    }
    
    // Check description for withdrawal indicators
    if (descStr.includes('withdrawal') || descStr.includes('debit') || descStr.includes('payment')) {
      return true;
    }
    
    // Exclude obvious credits
    if (descStr.includes('salary') || descStr.includes('interest') || descStr.includes('credit') || descStr.includes('deposit')) {
      return false;
    }
    
    // Default to true if we can't determine (better to include and let user filter)
    return true;
  }

  /**
   * Filter transactions to include only withdrawals and exclude common non-expense items
   */
  filterWithdrawals(transactions) {
    return transactions.filter(transaction => {
      const desc = transaction.description.toLowerCase();
      
      // Exclude internal transfers, salary, interest, etc.
      const excludePatterns = [
        /salary|interest|dividend|refund|cashback/i,
        /opening balance|closing balance/i,
        /^\s*balance\s*/i,
        /^\s*total\s*/i,
        /transfer.*own.*account/i
      ];

      for (const pattern of excludePatterns) {
        if (pattern.test(desc)) {
          return false;
        }
      }

      return transaction.type === 'withdrawal' && transaction.amount > 0;
    });
  }

  /**
   * Utility methods
   */
  looksLikeDate(value) {
    const str = String(value).trim();
    // Check for common date patterns
    return /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(str) || 
           /\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/.test(str) ||
           !isNaN(Date.parse(str));
  }

  looksLikeAmount(value) {
    const str = String(value).trim();
    // Check for number patterns
    return /^\d+,?\d*\.?\d*$/.test(str.replace(/[,\s]/g, '')) && 
           !isNaN(parseFloat(str.replace(/[,\s]/g, '')));
  }

  parseDate(dateValue) {
    if (!dateValue) return new Date();
    
    // Handle Excel date numbers
    if (typeof dateValue === 'number') {
      // Excel stores dates as numbers (days since 1900-01-01)
      const excelEpoch = new Date(1900, 0, 1);
      const date = new Date(excelEpoch.getTime() + (dateValue - 1) * 24 * 60 * 60 * 1000);
      return date;
    }
    
    // Handle string dates
    const dateStr = String(dateValue).trim();
    
    // Try different date formats
    const formats = [
      /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/,  // DD/MM/YYYY or DD-MM-YYYY
      /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/,  // YYYY/MM/DD or YYYY-MM-DD
      /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})/   // DD/MM/YY or DD-MM-YY
    ];
    
    for (const format of formats) {
      const match = dateStr.match(format);
      if (match) {
        if (format.source.includes('(\\d{4})')) {
          // YYYY/MM/DD format
          const [, year, month, day] = match;
          return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        } else {
          // DD/MM/YYYY or DD/MM/YY format
          const [, day, month, year] = match;
          const fullYear = year.length === 2 ? (parseInt(year) < 50 ? 2000 + parseInt(year) : 1900 + parseInt(year)) : parseInt(year);
          return new Date(fullYear, parseInt(month) - 1, parseInt(day));
        }
      }
    }
    
    // Fallback to Date.parse
    const parsed = new Date(dateStr);
    return isNaN(parsed.getTime()) ? new Date() : parsed;
  }

  parseAmount(amountValue) {
    if (!amountValue) return 0;
    
    // Handle numbers directly
    if (typeof amountValue === 'number') {
      return Math.abs(amountValue); // Take absolute value for withdrawals
    }
    
    // Handle string amounts
    const amountStr = String(amountValue).trim();
    
    // Remove currency symbols, commas, and extra spaces
    const cleaned = amountStr
      .replace(/[₹$€£,\s]/g, '')  // Remove currency symbols and commas
      .replace(/[()]/g, '')       // Remove parentheses
      .replace(/-/g, '');         // Remove minus signs (we handle withdrawals separately)
    
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : Math.abs(parsed);
  }

  cleanDescription(description) {
    if (!description) return 'Transaction';
    
    const desc = String(description).trim();
    
    // Clean up the description
    return desc
      .replace(/\s+/g, ' ')                    // Multiple spaces to single space
      .replace(/[^\w\s@\/\-\.\(\)]/g, '')      // Remove special characters except common ones
      .substring(0, 100)                       // Limit length
      .trim();
  }

  determinePaymentMethod(description) {
    const desc = description.toLowerCase();
    
    for (const [method, pattern] of Object.entries(this.paymentMethodPatterns)) {
      if (pattern.test(desc)) {
        return method;
      }
    }
    
    // Default logic
    if (desc.includes('atm') || desc.includes('cash')) return 'Cash';
    if (desc.includes('card') || desc.includes('pos')) return 'Card';
    if (desc.includes('upi') || desc.includes('@')) return 'UPI';
    
    return 'Bank'; // Default
  }

  suggestCategory(description) {
    const desc = description.toLowerCase();
    
    for (const [category, pattern] of Object.entries(this.categoryPatterns)) {
      if (pattern.test(desc)) {
        return category;
      }
    }
    
    return 'Bank Transactions'; // Default category
  }
}

module.exports = BankStatementExcelParser;
