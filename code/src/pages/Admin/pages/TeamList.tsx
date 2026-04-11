import { useState, useEffect } from 'react';
import { FaPlus, FaEdit, FaTrash, FaUser } from 'react-icons/fa';
import { api } from '../api';

interface TeamMember {
  id: number;
  name: string;
  role: string;
  bio: string;
  avatar_url: string;
  skills: string[];
  sort_order: number;
  status: string;
}

export default function TeamList() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    fetchMembers();
  }, []);

  const fetchMembers = async () => {
    try {
      const response = await api.get('/team');
      setMembers(response.data.data || []);
    } catch (error) {
      console.error('获取团队成员失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('确定要删除这个团队成员吗？')) return;
    
    try {
      await api.delete(`/team/${id}`);
      setMembers(members.filter(m => m.id !== id));
    } catch (error) {
      console.error('删除失败:', error);
      alert('删除失败，请重试');
    }
  };

  const toggleStatus = async (member: TeamMember) => {
    const newStatus = member.status === 'active' ? 'inactive' : 'active';
    try {
      await api.put(`/team/${member.id}`, { status: newStatus });
      setMembers(members.map(m => m.id === member.id ? { ...m, status: newStatus } : m));
    } catch (error) {
      console.error('更新状态失败:', error);
    }
  };

  const handleSave = async (data: Partial<TeamMember>) => {
    try {
      if (editingMember?.id) {
        await api.put(`/team/${editingMember.id}`, data);
      } else {
        await api.post('/team', data);
      }
      setShowForm(false);
      setEditingMember(null);
      fetchMembers();
    } catch (error) {
      console.error('保存失败:', error);
      alert('保存失败，请重试');
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white">团队管理</h1>
          <p className="text-gray-400 mt-1">管理团队成员信息</p>
        </div>
        <button
          onClick={() => {
            setEditingMember(null);
            setShowForm(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-pink-500 to-rose-600 rounded-lg text-white hover:opacity-90 transition-opacity"
        >
          <FaPlus />
          添加成员
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {members.map(member => (
            <div
              key={member.id}
              className="bg-white/5 backdrop-blur-sm rounded-2xl overflow-hidden border border-white/10 hover:border-white/20 transition-all duration-300"
            >
              <div className="p-6">
                <div className="flex items-start gap-4">
                  <div className="w-16 h-16 rounded-full overflow-hidden bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center flex-shrink-0">
                    {member.avatar_url ? (
                      <img
                        src={member.avatar_url}
                        alt={member.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <FaUser className="text-white text-2xl" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xl font-bold text-white">{member.name}</h3>
                    <p className="text-gray-400 text-sm">{member.role}</p>
                    <span className={`inline-block mt-2 px-2 py-1 text-xs rounded-full ${
                      member.status === 'active' 
                        ? 'bg-green-500/20 text-green-400' 
                        : 'bg-gray-500/20 text-gray-400'
                    }`}>
                      {member.status === 'active' ? '在职' : '离职'}
                    </span>
                  </div>
                </div>

                <p className="text-gray-400 text-sm mt-4 line-clamp-2">{member.bio}</p>

                {/* 技能标签 */}
                <div className="flex flex-wrap gap-2 mt-4">
                  {member.skills?.slice(0, 3).map((skill, i) => (
                    <span
                      key={i}
                      className="px-2 py-1 bg-white/10 text-gray-300 rounded text-xs"
                    >
                      {skill}
                    </span>
                  ))}
                  {member.skills?.length > 3 && (
                    <span className="px-2 py-1 bg-white/10 text-gray-400 rounded text-xs">
                      +{member.skills.length - 3}
                    </span>
                  )}
                </div>

                {/* 操作按钮 */}
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/10">
                  <button
                    onClick={() => toggleStatus(member)}
                    className="text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    {member.status === 'active' ? '设为离职' : '设为在职'}
                  </button>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setEditingMember(member);
                        setShowForm(true);
                      }}
                      className="p-2 bg-white/5 rounded-lg hover:bg-white/10 transition-colors"
                    >
                      <FaEdit className="text-blue-400" />
                    </button>
                    <button
                      onClick={() => handleDelete(member.id)}
                      className="p-2 bg-white/5 rounded-lg hover:bg-red-500/20 transition-colors"
                    >
                      <FaTrash className="text-red-400" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && members.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-400">暂无团队成员，点击右上角添加</p>
        </div>
      )}

      {/* 编辑表单弹窗 */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0F0F1A] rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold text-white mb-4">
              {editingMember ? '编辑成员' : '添加成员'}
            </h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.target as HTMLFormElement);
                const skills = (formData.get('skills') as string)?.split(',').map(s => s.trim()).filter(Boolean);
                handleSave({
                  name: formData.get('name') as string,
                  role: formData.get('role') as string,
                  bio: formData.get('bio') as string,
                  avatar_url: formData.get('avatar_url') as string,
                  skills,
                  status: formData.get('status') as string,
                });
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-gray-300 mb-2">姓名 *</label>
                <input
                  name="name"
                  defaultValue={editingMember?.name}
                  required
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-pink-500"
                />
              </div>
              <div>
                <label className="block text-gray-300 mb-2">职位</label>
                <input
                  name="role"
                  defaultValue={editingMember?.role}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-pink-500"
                />
              </div>
              <div>
                <label className="block text-gray-300 mb-2">简介</label>
                <textarea
                  name="bio"
                  defaultValue={editingMember?.bio}
                  rows={3}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-pink-500 resize-none"
                />
              </div>
              <div>
                <label className="block text-gray-300 mb-2">头像链接</label>
                <input
                  name="avatar_url"
                  defaultValue={editingMember?.avatar_url}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-pink-500"
                />
              </div>
              <div>
                <label className="block text-gray-300 mb-2">技能（逗号分隔）</label>
                <input
                  name="skills"
                  defaultValue={editingMember?.skills?.join(', ')}
                  placeholder="3D建模, 原画设计, Blender"
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-pink-500"
                />
              </div>
              <div>
                <label className="block text-gray-300 mb-2">状态</label>
                <select
                  name="status"
                  defaultValue={editingMember?.status || 'active'}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-pink-500"
                >
                  <option value="active">在职</option>
                  <option value="inactive">离职</option>
                </select>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingMember(null);
                  }}
                  className="flex-1 px-4 py-2 bg-white/5 text-gray-300 rounded-lg hover:bg-white/10 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-pink-500 to-rose-600 rounded-lg text-white hover:opacity-90 transition-opacity"
                >
                  保存
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
