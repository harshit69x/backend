const pdf = require('pdf-parse');

class BankStatementParser {
  constructor() {
    // Payment method patterns for different transaction types
    this.paymentMethodPatterns = {
      'UPI': /UPI|paytm|gpay|phonepe|bhim|@|\/pay/i,
      'Card': /card|visa|mastercard|atm|pos/i,
      'Bank': /neft|rtgs|imps|transfer|cheque|chq/i,
      'Cash': /cash|withdrawal|wd/i
    };

    // Category suggestions based on transaction descriptions
    this.categoryPatterns = {
      'Food & Dining': /restaurant|food|dining|cafe|pizza|burger|swiggy|zomato|delivery/i,
      'Transportation': /uber|ola|taxi|metro|bus|transport|fuel|petrol|diesel/i,
      'Shopping': /amazon|flipkart|shopping|mall|store|purchase/i,
      'Entertainment': /movie|cinema|netflix|spotify|game|entertainment/i,
      'Utilities': /electricity|water|gas|internet|mobile|phone|bill/i,
      'Healthcare': /hospital|medical|pharmacy|doctor|health/i,
      'Education': /school|college|university|course|education|fees/i,
      'Groceries': /grocery|supermarket|mart|vegetables|fruits/i,
      'ATM Withdrawal': /atm|cash.*withdrawal|wd/i,
      'Bank Charges': /charge|fee|penalty|maintenance/i
    };

    // Common bank transaction patterns
    this.transactionPatterns = [
      // Federal Bank pattern (based on your image)
      /(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+TFR\s+(\d+\.\d{2})\s+(\d+\.\d{2})\s+(Dr|Cr)/g,
      
      // Generic patterns for other banks
      /(\d{1,2}\/\d{1,2}\/\d{4})\s+(.+?)\s+(\d+,?\d*\.\d{2})\s+(Dr|Debit)/gi,
      /(\d{1,2}-\d{1,2}-\d{4})\s+(.+?)\s+(\d+,?\d*\.\d{2})\s+(Dr|Debit)/gi,
      
      // Alternative format with amount at the end
      /(\d{1,2}\/\d{1,2}\/\d{4})\s+(.+?)\s+(Dr|Debit)\s+(\d+,?\d*\.\d{2})/gi,
    ];

    // Patterns to exclude (credits, internal transfers, etc.)
    this.excludePatterns = [
      /salary|interest|dividend|refund|credit|deposit/i,
      /opening balance|closing balance/i,
      /^\s*balance\s*/i,
      /^\s*total\s*/i
    ];
  }

  /**
   * Parse PDF buffer and extract transactions
   */
  async parseBankStatement(pdfBuffer) {
    try {
      const data = await pdf(pdfBuffer);
      const text = data.text;
      
      console.log('PDF Text Preview:', text.substring(0, 500));
      
      const transactions = this.extractTransactions(text);
      const filteredTransactions = this.filterWithdrawals(transactions);
      
      console.log(`Extracted ${transactions.length} total transactions, ${filteredTransactions.length} withdrawals`);
      
      return filteredTransactions;
    } catch (error) {
      console.error('Error parsing PDF:', error);
      throw new Error('Failed to parse bank statement PDF');
    }
  }

  /**
   * Extract transactions from text using various patterns
   */
  extractTransactions(text) {
    const transactions = [];
    
    // Try each pattern
    for (const pattern of this.transactionPatterns) {
      const matches = [...text.matchAll(pattern)];
      
      for (const match of matches) {
        try {
          const transaction = this.parseTransactionMatch(match, pattern);
          if (transaction) {
            transactions.push(transaction);
          }
        } catch (error) {
          console.log('Error parsing transaction match:', error.message);
        }
      }
    }

    // If no structured patterns match, try fallback parsing
    if (transactions.length === 0) {
      return this.fallbackParsing(text);
    }

    return transactions;
  }

  /**
   * Parse individual transaction match based on pattern
   */
  parseTransactionMatch(match, pattern) {
    // Federal Bank format (from your image)
    if (pattern.source.includes('TFR')) {
      const [, date, , description, , amount, type] = match; // Skip valueDate
      
      if (type.toLowerCase() === 'dr') {
        return {
          date: this.parseDate(date),
          description: this.cleanDescription(description),
          amount: this.parseAmount(amount),
          paymentMethod: this.determinePaymentMethod(description),
          suggestedCategory: this.suggestCategory(description),
          type: 'withdrawal'
        };
      }
    }
    
    // Generic patterns
    if (match.length >= 4) {
      const isDebit = match.some(part => /dr|debit/i.test(part));
      
      if (isDebit) {
        let date, description, amount;
        
        // Find date (first match that looks like a date)
        date = match.find(part => /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/.test(part));
        
        // Find amount (last number that looks like currency)
        const amountMatches = match.filter(part => /\d+,?\d*\.\d{2}/.test(part));
        amount = amountMatches[amountMatches.length - 1];
        
        // Description is the longest text part that's not date, amount, or type
        description = match.find(part => 
          part.length > 5 && 
          !/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/.test(part) && 
          !/^\d+,?\d*\.\d{2}$/.test(part) && 
          !/^(dr|cr|debit|credit)$/i.test(part)
        ) || 'Transaction';

        return {
          date: this.parseDate(date),
          description: this.cleanDescription(description),
          amount: this.parseAmount(amount),
          paymentMethod: this.determinePaymentMethod(description),
          suggestedCategory: this.suggestCategory(description),
          type: 'withdrawal'
        };
      }
    }

    return null;
  }

  /**
   * Fallback parsing for unstructured text
   */
  fallbackParsing(text) {
    const lines = text.split('\n');
    const transactions = [];

    for (const line of lines) {
      // Skip empty lines and headers
      if (!line.trim() || this.shouldExcludeLine(line)) {
        continue;
      }

      // Look for lines with date, description, and amount
      const dateMatch = line.match(/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/);
      const amountMatch = line.match(/(\d+,?\d*\.\d{2})/g);
      const debitMatch = line.match(/dr|debit|withdrawal/i);

      if (dateMatch && amountMatch && debitMatch) {
        try {
          const transaction = {
            date: this.parseDate(dateMatch[0]),
            description: this.extractDescriptionFromLine(line, dateMatch[0], amountMatch),
            amount: this.parseAmount(amountMatch[amountMatch.length - 1]),
            paymentMethod: this.determinePaymentMethod(line),
            suggestedCategory: this.suggestCategory(line),
            type: 'withdrawal'
          };

          transactions.push(transaction);
        } catch (error) {
          console.log('Error parsing fallback transaction:', error.message);
        }
      }
    }

    return transactions;
  }

  /**
   * Filter transactions to include only withdrawals
   */
  filterWithdrawals(transactions) {
    return transactions.filter(transaction => {
      // Exclude based on description patterns
      for (const pattern of this.excludePatterns) {
        if (pattern.test(transaction.description)) {
          return false;
        }
      }

      // Only include if it's a withdrawal/debit
      return transaction.type === 'withdrawal' && transaction.amount > 0;
    });
  }

  /**
   * Utility methods
   */
  parseDate(dateStr) {
    if (!dateStr) return new Date();
    
    // Handle different date formats
    const cleaned = dateStr.replace(/[^\d\/\-]/g, '');
    const parts = cleaned.split(/[\/\-]/);
    
    if (parts.length === 3) {
      // Assume DD/MM/YYYY or DD-MM-YYYY
      const [day, month, year] = parts;
      return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    }
    
    return new Date(dateStr);
  }

  parseAmount(amountStr) {
    if (!amountStr) return 0;
    
    // Remove commas and convert to number
    const cleaned = amountStr.replace(/[,\s]/g, '');
    return parseFloat(cleaned) || 0;
  }

  cleanDescription(description) {
    if (!description) return 'Transaction';
    
    // Remove extra spaces and clean up
    return description
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s@\/\-\.]/g, '')
      .trim()
      .substring(0, 100); // Limit length
  }

  determinePaymentMethod(description) {
    const desc = description.toLowerCase();
    
    for (const [method, pattern] of Object.entries(this.paymentMethodPatterns)) {
      if (pattern.test(desc)) {
        return method;
      }
    }
    
    // Default based on common patterns
    if (desc.includes('atm') || desc.includes('withdraw')) return 'Cash';
    if (desc.includes('transfer') || desc.includes('tfr')) return 'Bank';
    
    return 'Bank'; // Default
  }

  shouldExcludeLine(line) {
    const lower = line.toLowerCase();
    return (
      lower.includes('opening balance') ||
      lower.includes('closing balance') ||
      lower.includes('page') ||
      lower.includes('statement') ||
      lower.includes('account') ||
      lower.length < 10
    );
  }

  extractDescriptionFromLine(line, dateStr, amountMatches) {
    // Remove date and amounts from line to get description
    let description = line;
    description = description.replace(dateStr, '');
    
    for (const amount of amountMatches) {
      description = description.replace(amount, '');
    }
    
    description = description.replace(/dr|cr|debit|credit/gi, '');
    
    return this.cleanDescription(description);
  }

  suggestCategory(description) {
    const desc = description.toLowerCase();
    
    for (const [category, pattern] of Object.entries(this.categoryPatterns)) {
      if (pattern.test(desc)) {
        return category;
      }
    }
    
    // Default category suggestion
    return 'Bank Transactions';
  }
}

module.exports = BankStatementParser;
