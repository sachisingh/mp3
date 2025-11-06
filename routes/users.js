const router = require('express').Router();
const User = require('../models/user');
const Task = require('../models/task');

// Inline helper functions in code
function parseJSON(str) { if (str == null) return undefined; try { return JSON.parse(str); } catch { return undefined; } }
async function runQuery(Model, q) {
  const where  = parseJSON(q.where)  || {};
  const sort   = parseJSON(q.sort)   || undefined;
  const select = parseJSON(q.select) || parseJSON(q.filter) || undefined;
  const skip   = q.skip  ? Number(q.skip)  : 0;
  const limit  = q.limit ? Number(q.limit) : (Model.modelName === 'Task' ? 100 : 0);

  if (String(q.count) === 'true') return { count: await Model.countDocuments(where) };

  let query = Model.find(where);
  if (select) query = query.select(select);
  if (sort)   query = query.sort(sort);
  if (skip)   query = query.skip(skip);
  if (limit)  query = query.limit(limit);
  return query.exec();
}

// Fetch all users
router.get('/', async (req, res, next) => {
  try {
    const data = await runQuery(User, req.query);
    res.status(200).json({ message: 'OK', data });
  } catch (e) { next(e); }
});

// Fetch user by ID
router.get('/:id', async (req, res, next) => {
  try {
    const select = parseJSON(req.query.select) || parseJSON(req.query.filter) || undefined;
    const doc = await User.findById(req.params.id).select(select || undefined);
    if (!doc) return res.status(404).json({ message: 'Not Found', data: null });
    res.status(200).json({ message: 'OK', data: doc });
  } catch (e) { next(e); }
});

// Create a new user
router.post('/', async (req, res, next) => {
  try {
    const body = {
      name: req.body.name,
      email: req.body.email,
      pendingTasks: Array.isArray(req.body.pendingTasks) ? req.body.pendingTasks : []
    };
    if (!body.name || !body.email) return res.status(400).json({ message: 'Bad Request', data: null });

    const created = await User.create(body);

    if (body.pendingTasks.length) {
      await Task.updateMany(
        { _id: { $in: body.pendingTasks } },
        { $set: { assignedUser: String(created._id), assignedUserName: created.name, completed: false } }
      );
    }
    res.status(201).json({ message: 'Created', data: created });
  } catch (e) {
    if (e.code === 11000) return res.status(400).json({ message: 'Bad Request', data: null });
    next(e);
  }
});

// Replace existing user data
router.put('/:id', async (req, res, next) => {
  try {
    const { name, email } = req.body;
    let pendingTasks = req.body.pendingTasks;

    if (typeof pendingTasks === 'string') pendingTasks = pendingTasks.split(',').filter(Boolean);
    if (!name || !email || !Array.isArray(pendingTasks))
      return res.status(400).json({ message: 'Bad Request', data: null });

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Not Found', data: null });

    const oldSet = new Set((user.pendingTasks || []).map(String));
    const newSet = new Set(pendingTasks.map(String));
    const toUnassign = [...oldSet].filter(x => !newSet.has(x));
    const toAssign   = [...newSet].filter(x => !oldSet.has(x));

    if (toUnassign.length) {
      await Task.updateMany(
        { _id: { $in: toUnassign }, assignedUser: String(user._id) },
        { $set: { assignedUser: '', assignedUserName: 'unassigned' } }
      );
    }
    if (toAssign.length) {
      await Task.updateMany(
        { _id: { $in: toAssign } },
        { $set: { assignedUser: String(user._id), assignedUserName: name, completed: false } }
      );
    }

    user.name = name;
    user.email = email;
    user.pendingTasks = pendingTasks;
    await user.save();

    res.status(200).json({ message: 'OK', data: user });
  } catch (e) {
    if (e.code === 11000) return res.status(400).json({ message: 'Bad Request', data: null });
    next(e);
  }
});

// Delete user by ID
router.delete('/:id', async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Not Found', data: null });

    if (user.pendingTasks?.length) {
      await Task.updateMany(
        { _id: { $in: user.pendingTasks } },
        { $set: { assignedUser: '', assignedUserName: 'unassigned' } }
      );
    }
    await user.deleteOne();
    res.status(204).json({ message: 'No Content', data: null });
  } catch (e) { next(e); }
});

module.exports = router;