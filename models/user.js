var mongoose = require('mongoose');

var UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'name is required'] },
    email: { type: String, required: [true, 'email is required'], unique: true, trim: true, lowercase: true },
    pendingTasks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }],
    dateCreated: { type: Date, default: Date.now }
  },
  { versionKey: false }
);

UserSchema.index({ email: 1 }, { unique: true });

module.exports = mongoose.model('User', UserSchema);