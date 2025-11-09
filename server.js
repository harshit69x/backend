const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
require('dotenv').config();

// Models
const Expense = require('./models/expense');
const Category = require('./models/category');
const User = require('./models/user');

// Services
const BankStatementExcelParser = require('./services/excelParser');

// Auth Controller
const { register, login, loginWithQuery, verifyEmail, authenticateToken, optionalAuth } = require('./authController');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Configure multer for Excel file uploads
const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
      'application/vnd.ms-excel.sheet.macroEnabled.12' // .xlsm
    ];
    
    if (allowedTypes.includes(file.mimetype) || 
        file.originalname.toLowerCase().endsWith('.xlsx') ||
        file.originalname.toLowerCase().endsWith('.xls') ||
        file.originalname.toLowerCase().endsWith('.xlsm')) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files (.xlsx, .xls, .xlsm) are allowed'), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Initialize Excel parser
const excelParser = new BankStatementExcelParser();

const MONGODB_URI = process.env.MONGODB_URI;

// Connect to MongoDB
mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => {
    console.error('MongoDB connection error:', err.message || err);
    process.exit(1);
  });

// --- Authentication Endpoints ---
// SIGNUP endpoint - POST with JSON body
app.post('/api/signup', register);

// LOGIN endpoint - POST with JSON body (recommended)
app.post('/api/login', login);

// VERIFY EMAIL endpoint - POST to confirm email verification
app.post('/api/verify-email', verifyEmail);

// --- Users CRUD (with integrated auth) ---
app.get('/api/users', async (req, res) => {
  try {
    const { email, password } = req.query;

    // Legacy support for mobile app login via query params
    if (email && password) {
      return loginWithQuery(req, res);
    }

    // Return all users (without passwordHash) - consider adding auth protection
    const users = await User.find().select('-passwordHash');
    res.json(users);

  } catch (_err) {
    console.error(_err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.post('/api/users', register); // This handles both user creation AND registration with hashing

app.get('/api/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-passwordHash');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (_err) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

app.put('/api/users/:id', async (req, res) => {
  try {
    const updates = { ...req.body };
    // prevent changing passwordHash via this endpoint
    if (updates.passwordHash) delete updates.passwordHash;
    if (updates.password) delete updates.password;
    
    const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true }).select('-passwordHash');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (_err) {
    res.status(400).json({ error: 'Failed to update user' });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (_err) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Set user income
app.put('/api/users/:id/income', async (req, res) => {
  try {
    const { income } = req.body;
    
    if (income === undefined || income === null) {
      return res.status(400).json({ error: 'Income value is required' });
    }
    
    if (income < 0) {
      return res.status(400).json({ error: 'Income cannot be negative' });
    }
    
    const user = await User.findByIdAndUpdate(
      req.params.id, 
      { income: income }, 
      { new: true }
    ).select('-passwordHash');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ 
      success: true, 
      message: 'Income updated successfully',
      user: user 
    });
  } catch (_err) {
    console.error('Error updating user income:', _err);
    res.status(500).json({ error: 'Failed to update user income' });
  }
});

// Get user income
app.get('/api/users/:id/income', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('income name email');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ 
      userId: user._id,
      name: user.name,
      email: user.email,
      income: user.income || 0 
    });
  } catch (_err) {
    console.error('Error fetching user income:', _err);
    res.status(500).json({ error: 'Failed to fetch user income' });
  }
});

// --- Excel Bank Statement Processing ---
app.post('/api/upload-bank-statement', upload.single('bankStatement'), async (req, res) => {
  try {
    const { userId, defaultCategoryId } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'No Excel file uploaded' });
    }

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    // Verify user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get or create default category for bank transactions
    let categoryId = defaultCategoryId;
    if (!categoryId) {
      // First try to find existing "Bank Transactions" category for this user
      let category = await Category.findOne({ 
        name: 'Bank Transactions', 
        userId: userId 
      });
      
      if (!category) {
        // Create a user-specific "Bank Transactions" category
        category = await Category.create({
          name: 'Bank Transactions',
          userId: userId,
          color: '#3B82F6',
          icon: 'card'
        });
        console.log(`Created new category "Bank Transactions" for user ${userId}`);
      } else {
        console.log(`Using existing "Bank Transactions" category for user ${userId}`);
      }
      categoryId = category._id;
    }

    console.log(`Processing Excel bank statement for user ${userId}`);
    
    // Parse the Excel file from memory buffer
    const transactions = await excelParser.parseBankStatement(req.file.buffer);

    console.log(`Extracted ${transactions.length} withdrawal transactions`);

    // Convert and save transactions to database
    const savedTransactions = [];
    let successCount = 0;
    let errorCount = 0;

    for (const transaction of transactions) {
      try {
        // Check if transaction already exists (prevent duplicates)
        const existingTransaction = await Expense.findOne({
          userId: userId,
          amount: transaction.amount,
          date: transaction.date,
          description: transaction.description
        });

        if (existingTransaction) {
          console.log(`Duplicate transaction skipped: ${transaction.description}`);
          continue;
        }

        // Get or create category based on suggestion
        let transactionCategoryId = categoryId; // Default to "Bank Transactions"
        
        if (transaction.suggestedCategory && transaction.suggestedCategory !== 'Bank Transactions') {
          let suggestedCat = await Category.findOne({ 
            name: transaction.suggestedCategory, 
            userId: userId 
          });
          
          if (!suggestedCat) {
            // Create the suggested category
            const categoryColors = {
              'Food & Dining': '#FF6B6B',
              'Transportation': '#4ECDC4', 
              'Shopping': '#45B7D1',
              'Entertainment': '#96CEB4',
              'Utilities': '#FECA57',
              'Healthcare': '#FF9FF3',
              'Education': '#54A0FF',
              'Groceries': '#5F27CD',
              'ATM Withdrawal': '#00D2D3',
              'Bank Charges': '#FF3838'
            };
            
            suggestedCat = await Category.create({
              name: transaction.suggestedCategory,
              userId: userId,
              color: categoryColors[transaction.suggestedCategory] || '#3B82F6',
              icon: 'pricetag'
            });
            console.log(`Created new category "${transaction.suggestedCategory}" for user ${userId}`);
          }
          transactionCategoryId = suggestedCat._id;
        }

        // Create expense record
        const expense = new Expense({
          userId: userId,
          amount: transaction.amount,
          categoryId: transactionCategoryId,
          description: transaction.description,
          paymentMethod: transaction.paymentMethod,
          date: transaction.date,
          notes: `Imported from Excel bank statement${transaction.suggestedCategory ? ` (Auto-categorized as ${transaction.suggestedCategory})` : ''}`,
          tags: ['bank-import', 'auto-generated', ...(transaction.suggestedCategory ? [transaction.suggestedCategory.toLowerCase().replace(/\s+/g, '-')] : [])],
          attachmentUrl: req.file.originalname // Store the Excel filename for reference
        });

        const savedExpense = await expense.save();
        savedTransactions.push(savedExpense);
        successCount++;

      } catch (error) {
        console.error(`Error saving transaction: ${transaction.description}`, error);
        errorCount++;
      }
    }

    res.json({
      success: true,
      message: `Excel bank statement processed successfully`,
      summary: {
        totalTransactions: transactions.length,
        savedTransactions: successCount,
        errors: errorCount,
        duplicatesSkipped: transactions.length - successCount - errorCount
      },
      transactions: savedTransactions.map(t => ({
        id: t._id,
        amount: t.amount,
        description: t.description,
        date: t.date,
        paymentMethod: t.paymentMethod
      }))
    });

  } catch (error) {
    console.error('Error processing Excel bank statement:', error);

    res.status(500).json({ 
      error: 'Failed to process Excel bank statement',
      details: error.message 
    });
  }
});

// Test endpoint for Excel parsing (without saving to database)
app.post('/api/test-excel-parse', upload.single('bankStatement'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No Excel file uploaded' });
    }

    console.log('Testing Excel parsing...');
    
    // Parse the Excel file from memory buffer
    const transactions = await excelParser.parseBankStatement(req.file.buffer);

    res.json({
      success: true,
      message: `Extracted ${transactions.length} withdrawal transactions from Excel`,
      transactions: transactions.map(t => ({
        date: t.date,
        description: t.description,
        amount: t.amount,
        paymentMethod: t.paymentMethod,
        type: t.type,
        suggestedCategory: t.suggestedCategory
      }))
    });

  } catch (error) {
    console.error('Error testing Excel parse:', error);

    res.status(500).json({ 
      error: 'Failed to parse Excel file',
      details: error.message 
    });
  }
});

// --- Expenses CRUD ---
// GET /api/expenses?startDate=&endDate=&category=&search=&page=&limit=&sort=
app.get('/api/expenses', async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      category,
      paymentMethod,
      search,
      page = 1,
      limit = 50,
      sort = '-date'
    } = req.query;

    const filter = {};
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }
    if (category) filter.categoryId = category;
    if (paymentMethod) filter.paymentMethod = paymentMethod;
  // optional server-side user filter
  if (req.query.userId) filter.userId = req.query.userId;
    if (search) filter.$or = [
      { title: { $regex: search, $options: 'i' } },
      { notes: { $regex: search, $options: 'i' } }
    ];

    const skip = (Number(page) - 1) * Number(limit);

    // Build query and use lean() to avoid mongoose document getters causing unexpected errors
    const query = Expense.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(Number(limit))
      .populate('categoryId', 'name color icon')
      .populate('userId', 'name')
      .lean();

    const expenses = await query.exec();
    const total = await Expense.countDocuments(filter);

    res.json({ data: expenses, total });
  } catch (_err) {
    console.error('Error in GET /api/expenses:', _err && _err.stack ? _err.stack : _err);
    // Handle common mongoose cast errors more clearly
    if (_err && _err.name === 'CastError') return res.status(400).json({ error: 'Invalid id format in query' });
    res.status(500).json({ error: 'Failed to fetch expenses' });
  }
});

app.post('/api/expenses', async (req, res) => {
  try {
    const { userId, amount, categoryId, paymentMethod, date, notes, tags, attachmentUrl } = req.body;

    // Validate required fields according to model
    if (!userId || !amount || !categoryId || !paymentMethod || !date) {
      return res.status(400).json({ error: 'Missing required fields: walletId, userId, amount, categoryId, paymentMethod, date' });
    }

    const expense = new Expense({  userId, amount, categoryId, paymentMethod, date, notes, tags, attachmentUrl });
    await expense.save();
    res.status(201).json(expense);
  } catch (_err) {
    console.error(_err);
    res.status(400).json({ error: 'Failed to create expense' });
  }
});

app.get('/api/expenses/:userId', async (req, res) => {
  try {
    const expenses = await Expense.find({ userId: req.params.userId })
      .populate('categoryId', 'name color icon')
      .populate('userId', 'name');
    if (!expenses) return res.status(404).json({ error: 'Expenses not found' });
    res.json(expenses);
  } catch (_err) {
    console.error(_err);
    res.status(500).json({ error: 'Failed to fetch expense' });
  }
});

app.put('/api/expenses/:id', async (req, res) => {
  try {
    const expense = await Expense.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!expense) return res.status(404).json({ error: 'Expense not found' });
    res.json(expense);
  } catch (_err) {
    console.error(_err);
    res.status(400).json({ error: 'Failed to update expense' });
  }
});

app.delete('/api/expenses/:id', async (req, res) => {
  try {
    const expense = await Expense.findByIdAndDelete(req.params.id);
    if (!expense) return res.status(404).json({ error: 'Expense not found' });
    res.json({ success: true });
  } catch (_err) {
    console.error(_err);
    res.status(500).json({ error: 'Failed to delete expense' });
  }
});

// Delete multiple expenses at once
app.delete('/api/expenses', async (req, res) => {
  try {
    const { expenseIds, userId } = req.body;
    
    if (!expenseIds || !Array.isArray(expenseIds) || expenseIds.length === 0) {
      return res.status(400).json({ error: 'expenseIds array is required and cannot be empty' });
    }
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    
    // Validate that all expense IDs are valid ObjectIds
    const { ObjectId } = mongoose.Types;
    const validIds = expenseIds.filter(id => ObjectId.isValid(id));
    
    if (validIds.length !== expenseIds.length) {
      return res.status(400).json({ 
        error: 'Some expense IDs are invalid',
        invalidIds: expenseIds.filter(id => !ObjectId.isValid(id))
      });
    }
    
    // Delete expenses that match the IDs AND belong to the user
    const deleteResult = await Expense.deleteMany({
      _id: { $in: validIds },
      userId: userId
    });
    
    res.json({
      success: true,
      message: `${deleteResult.deletedCount} expenses deleted successfully`,
      deletedCount: deleteResult.deletedCount,
      requestedCount: expenseIds.length,
      notFound: expenseIds.length - deleteResult.deletedCount
    });
    
  } catch (_err) {
    console.error('Error deleting multiple expenses:', _err);
    res.status(500).json({ error: 'Failed to delete expenses' });
  }
});

// --- Categories CRUD ---
app.get('/api/categories', async (req, res) => {
  try {
    console.log("okay")
    const categories = await Category.find().sort('name');
    res.json(categories);
  } catch (_err) {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

app.post('/api/categories', async (req, res) => {
  try {
    const category = new Category(req.body);
    await category.save();
    res.status(201).json(category);
  } catch (_err) {
    res.status(400).json({ error: 'Failed to create category' });
  }
});

app.put('/api/categories/:id', async (req, res) => {
  try {
    const category = await Category.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!category) return res.status(404).json({ error: 'Category not found' });
    res.json(category);
  } catch (_err) {
    res.status(400).json({ error: 'Failed to update category' });
  }
});

app.delete('/api/categories/:id', async (req, res) => {
  try {
    const categoryId = req.params.id;
    const { userId } = req.body; // Or get from auth token/query params
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    
    // First, verify the category exists and belongs to the user
    const category = await Category.findOne({ _id: categoryId, userId: userId });
    
    if (!category) {
      return res.status(404).json({ error: 'Category not found or does not belong to this user' });
    }
    
    // Delete all expenses that belong to this category AND this user
    const deleteExpensesResult = await Expense.deleteMany({ 
      categoryId: categoryId, 
      userId: userId 
    });
    
    // Then delete the category itself (we already verified it belongs to the user)
    await Category.findByIdAndDelete(categoryId);
    
    res.json({ 
      success: true, 
      message: `Category deleted successfully. ${deleteExpensesResult.deletedCount} related expenses were also deleted.`,
      deletedExpensesCount: deleteExpensesResult.deletedCount
    });
  } catch (_err) {
    console.error('Error deleting category:', _err);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});



// --- Analytics Endpoints ---
// Category breakdown over a date range
app.get('/api/analytics/category-breakdown', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const match = {};
    if (startDate || endDate) {
      match.date = {};
      if (startDate) match.date.$gte = new Date(startDate);
      if (endDate) match.date.$lte = new Date(endDate);
    }

    const breakdown = await Expense.aggregate([
      { $match: match },
      { $group: { _id: '$categoryId', total: { $sum: '$amount' } } },
      { $lookup: { from: 'categories', localField: '_id', foreignField: '_id', as: 'category' } },
      { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
      { $project: { _id: 0, categoryId: '$_id', categoryName: '$category.name', color: '$category.color', total: 1 } },
      { $sort: { total: -1 } }
    ]);

    res.json(breakdown);
  } catch (_err) {
    console.error(_err);
    res.status(500).json({ error: 'Failed to compute category breakdown' });
  }
});

// Monthly trends - returns totals grouped by YYYY-MM
app.get('/api/analytics/monthly-trends', async (req, res) => {
  try {
    const { months = 6 } = req.query;
    const n = Math.max(1, Number(months));
    const start = new Date();
    start.setMonth(start.getMonth() - n + 1);
    start.setDate(1);

    const trends = await Expense.aggregate([
      { $match: { date: { $gte: start } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$date' } }, total: { $sum: '$amount' } } },
      { $project: { month: '$_id', total: 1, _id: 0 } },
      { $sort: { month: 1 } }
    ]);

    res.json(trends);
  } catch (_err) {
    console.error(_err);
    res.status(500).json({ error: 'Failed to compute monthly trends' });
  }
});

// Totals for given range: daily/weekly/monthly
app.get('/api/analytics/totals', async (req, res) => {
  try {
    const { startDate, endDate, interval = 'daily' } = req.query;
    const match = {};
    if (startDate || endDate) {
      match.date = {};
      if (startDate) match.date.$gte = new Date(startDate);
      if (endDate) match.date.$lte = new Date(endDate);
    }

    let groupId;
    switch (interval) {
      case 'monthly':
        groupId = { $dateToString: { format: '%Y-%m', date: '$date' } };
        break;
      case 'weekly':
        // Year + ISO week number approximation
        groupId = { $dateToString: { format: '%G-%V', date: '$date' } };
        break;
      case 'daily':
      default:
        groupId = { $dateToString: { format: '%Y-%m-%d', date: '$date' } };
    }

    const totals = await Expense.aggregate([
      { $match: match },
      { $group: { _id: groupId, total: { $sum: '$amount' } } },
      { $project: { period: '$_id', total: 1, _id: 0 } },
      { $sort: { period: 1 } }
    ]);

    res.json(totals);
  } catch (_err) {
    console.error(_err);
    res.status(500).json({ error: 'Failed to compute totals' });
  }
});

// Health check
app.get('/api/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
app.get('/api/health', (req, res) => res.json({ ok: true }));


