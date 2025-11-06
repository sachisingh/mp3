const router = require('express').Router();
const Task = require('../models/task');
const User = require('../models/user');

// Helper functions
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

async function syncPending(task) {
  const uid = task.assignedUser;

  if (!uid) {
    await User.updateMany({ pendingTasks: task._id }, { $pull: { pendingTasks: task._id } });
    return;
  }
  const user = await User.findById(uid);
  if (!user) {
    task.assignedUser = '';
    task.assignedUserName = 'unassigned';
    await task.save();
    return;
  }
  if (task.completed) {
    await User.updateOne({ _id: user._id }, { $pull: { pendingTasks: task._id } });
  } else {
    await User.updateOne(
      { _id: user._id, pendingTasks: { $ne: task._id } },
      { $push: { pendingTasks: task._id } }
    );
  }
}

// Fetch all tasks
router.get('/', async (req, res, next) => {
  try {
    const data = await runQuery(Task, req.query);
    res.status(200).json({ message: 'OK', data });
  } catch (e) { next(e); }
});

// Fetch task by ID
router.get('/:id', async (req, res, next) => {
  try {
    const select = parseJSON(req.query.select) || parseJSON(req.query.filter) || undefined;
    const doc = await Task.findById(req.params.id).select(select || undefined);
    if (!doc) return res.status(404).json({ message: 'Not Found', data: null });
    res.status(200).json({ message: 'OK', data: doc });
  } catch (e) { next(e); }
});

// Create a new task
router.post('/', async (req, res, next) => {
  try {
    const completed = String(req.body.completed).toLowerCase() === 'true';
    const body = {
      name: req.body.name,
      description: req.body.description || '',
      deadline: req.body.deadline ? new Date(Number(req.body.deadline) || req.body.deadline) : null,
      completed,
      assignedUser: req.body.assignedUser || '',
      assignedUserName: req.body.assignedUserName || 'unassigned'
    };
    if (!body.name || !body.deadline) return res.status(400).json({ message: 'Bad Request', data: null });

    if (body.assignedUser) {
      const u = await User.findById(body.assignedUser);
      if (!u) return res.status(400).json({ message: 'Bad Request', data: null });
      body.assignedUserName = u.name;
    } else {
      body.assignedUserName = 'unassigned';
    }

    const created = await Task.create(body);
    await syncPending(created);
    res.status(201).json({ message: 'Created', data: created });
  } catch (e) { next(e); }
});

// Replace existing task data
router.put('/:id', async (req, res, next) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: 'Not Found', data: null });

    const { name, description, deadline, completed, assignedUser, assignedUserName } = req.body;

    const isBool = v => (typeof v === 'boolean') || (v === 'true') || (v === 'false');
    if (
      typeof name !== 'string' ||
      typeof description !== 'string' ||
      !deadline ||
      !isBool(completed) ||
      typeof assignedUser !== 'string' ||
      typeof assignedUserName !== 'string'
    ) return res.status(400).json({ message: 'Bad Request', data: null });

    let newCompleted = typeof completed === 'boolean' ? completed : completed === 'true';
    let newAssignedUserName = assignedUserName;

    if (assignedUser) {
      const u = await User.findById(assignedUser);
      if (!u) return res.status(400).json({ message: 'Bad Request', data: null });
      newAssignedUserName = u.name;
    } else {
      newAssignedUserName = 'unassigned';
    }

    if (task.assignedUser && task.assignedUser !== assignedUser) {
      await User.updateOne({ _id: task.assignedUser }, { $pull: { pendingTasks: task._id } });
    }

    task.name = name;
    task.description = description;
    task.deadline = new Date(Number(deadline) || deadline);
    task.completed = newCompleted;
    task.assignedUser = assignedUser;
    task.assignedUserName = newAssignedUserName;

    await task.save();
    await syncPending(task);
    res.status(200).json({ message: 'OK', data: task });
  } catch (e) { next(e); }
});

// Delete task by ID
router.delete('/:id', async (req, res, next) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: 'Not Found', data: null });

    if (task.assignedUser) {
      await User.updateOne({ _id: task.assignedUser }, { $pull: { pendingTasks: task._id } });
    }
    await task.deleteOne();
    res.status(204).json({ message: 'No Content', data: null });
  } catch (e) { next(e); }
});

module.exports = router;