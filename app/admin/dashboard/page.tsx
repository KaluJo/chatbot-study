'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PlusCircle, Users, BarChart, MessageSquareText, Activity, Download, ArrowDown, ArrowRight, FileText, Mic, Check, X } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import type { ChatlogEntry } from '@/app/chat/services/chatlog-service'

type UserData = {
  id: string
  name: string
  email?: string
  access_code: string
  is_admin: boolean
  strategy_type: 'vertical' | 'horizontal'
  can_generate_surveys: boolean
  can_use_speech_patterns: boolean
  created_at: string
  sessionCount: number
  valueNodeCount: number
}

const StatCard: React.FC<{ title: string; value: string | number; description?: string }> = ({ title, value, description }) => (
  <div className="bg-white border-2 border-gray-200 p-4 sm:p-5 rounded-lg">
    <h3 className="text-sm font-medium text-gray-500">{title}</h3>
    <p className="text-2xl sm:text-3xl font-bold text-gray-900 mt-1">{value}</p>
    {description && <p className="text-xs text-gray-500 mt-2">{description}</p>}
  </div>
)

export default function AdminDashboardPage() {
  const { user, isLoading: authIsLoading, createUser: authCreateUser } = useAuth()
  const router = useRouter()
  const [users, setUsers] = React.useState<UserData[]>([])
  const [isLoadingUsers, setIsLoadingUsers] = React.useState(true)
  const [newUserData, setNewUserData] = React.useState({
    name: '',
    email: '',
    accessCode: '',
    isAdmin: false,
    strategyType: 'vertical' as 'vertical' | 'horizontal',
    canGenerateSurveys: false,
    canUseSpeechPatterns: false,
  })
  const [isCreateUserDialogOpen, setIsCreateUserDialogOpen] = React.useState(false)
  const [successMessage, setSuccessMessage] = React.useState('')
  const [errorMessage, setErrorMessage] = React.useState('')

  React.useEffect(() => {
    if (!authIsLoading && (!user || !user.isAdmin)) {
      router.replace('/login?callbackUrl=/admin/dashboard')
    }
  }, [user, authIsLoading, router])

  React.useEffect(() => {
    if (!user?.isAdmin || authIsLoading) return

    const loadUsers = async () => {
      setIsLoadingUsers(true)
      setErrorMessage('')
      const supabase = createClient()

      try {
        const { data: fetchedUsers, error: usersError } = await supabase
          .from('value_graph_users')
          .select('*')
          .neq('id', user.id)
          .order('created_at', { ascending: false })

        if (usersError) throw usersError
        if (!fetchedUsers) throw new Error("No users data received from Supabase.")

        const enhancedUsers = await Promise.all(
          fetchedUsers.map(async (userData) => {
            let sessionCount = 0
            try {
              const { data: sessionData, error: sessionError } = await supabase
                .from('chatlog')
                .select('session_id', { head: false })
                .eq('user_id', userData.id)
              if (sessionError && sessionError.code !== 'PGRST116') throw sessionError
              if (sessionData) {
                const distinctSessionIds = new Set(sessionData.map(s => s.session_id))
                sessionCount = distinctSessionIds.size
              }
            } catch (sError) {
              console.warn(`Error fetching session count for user ${userData.id}:`, sError)
            }

            let valueNodeCount = 0
            try {
              const { count, error: valueNodeError } = await supabase
                .from('value_nodes')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', userData.id)
              if (valueNodeError && valueNodeError.code !== 'PGRST116') throw valueNodeError
              valueNodeCount = count || 0
            } catch (vnError) {
              console.warn(`Error fetching value node count for user ${userData.id}:`, vnError)
            }
            
            return {
              ...userData,
              access_code: userData.access_code,
              is_admin: userData.is_admin,
              strategy_type: userData.strategy_type || 'vertical',
              can_generate_surveys: userData.can_generate_surveys ?? false,
              can_use_speech_patterns: userData.can_use_speech_patterns ?? false,
              sessionCount,
              valueNodeCount,
            } as UserData
          })
        )
        setUsers(enhancedUsers)
      } catch (error) {
        console.error('Error loading users:', error)
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load user data.')
      } finally {
        setIsLoadingUsers(false)
      }
    }

    loadUsers()
  }, [user, authIsLoading])

  const handleCreateUser = async () => {
    if (!newUserData.name.trim()) {
      setErrorMessage('Name is required.')
      return
    }
    setErrorMessage('')
    setSuccessMessage('')

    if (!user || !user.accessCode) {
      setErrorMessage('Admin access code not found. Cannot create user.')
      return
    }

    try {
      const supabase = createClient()
      
      // Generate a random access code if none provided
      const accessCode = newUserData.accessCode.trim() || 
        Math.random().toString(36).substring(2, 10).toUpperCase()
      
      // Insert directly into the table
      const { data, error } = await supabase
        .from('value_graph_users')
        .insert({
          name: newUserData.name,
          email: newUserData.email || null,
          access_code: accessCode,
          is_admin: newUserData.isAdmin,
          strategy_type: newUserData.strategyType,
          can_generate_surveys: newUserData.canGenerateSurveys,
          can_use_speech_patterns: newUserData.canUseSpeechPatterns,
        })
        .select()
        .single()

      if (error) throw error
      
      if (data) {
        setSuccessMessage(`User ${newUserData.name} created! Their access code is: ${accessCode}`)
        setNewUserData({ name: '', email: '', accessCode: '', isAdmin: false, strategyType: 'vertical', canGenerateSurveys: false, canUseSpeechPatterns: false })
        
        const newUserForList: UserData = {
          id: data.id,
          name: data.name,
          email: data.email || undefined,
          access_code: data.access_code,
          is_admin: data.is_admin,
          strategy_type: data.strategy_type || 'vertical',
          can_generate_surveys: data.can_generate_surveys ?? false,
          can_use_speech_patterns: data.can_use_speech_patterns ?? false,
          created_at: data.created_at,
          sessionCount: 0,
          valueNodeCount: 0
        }
        
        setUsers(prevUsers => [newUserForList, ...prevUsers])
        setTimeout(() => {
          setSuccessMessage('')
          setIsCreateUserDialogOpen(false)
        }, 3000)
      } else {
        setErrorMessage('Failed to create user. No data returned.')
      }
    } catch (error) {
      console.error('Error creating user:', error)
      setErrorMessage(error instanceof Error ? error.message : 'An unexpected error occurred.')
    }
  }

  const toggleStrategyType = async (selectedUserData: UserData) => {
    const newStrategyType = selectedUserData.strategy_type === 'vertical' ? 'horizontal' : 'vertical'
    
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('value_graph_users')
        .update({ strategy_type: newStrategyType })
        .eq('id', selectedUserData.id)
      
      if (error) {
        console.error('Error updating strategy type:', error)
        setErrorMessage(`Failed to update strategy type: ${error.message}`)
        return
      }
      
      // Update local state
      setUsers(prevUsers => 
        prevUsers.map(u => 
          u.id === selectedUserData.id 
            ? { ...u, strategy_type: newStrategyType }
            : u
        )
      )
      
      setSuccessMessage(`Strategy for ${selectedUserData.name} changed to ${newStrategyType.toUpperCase()}`)
      setTimeout(() => setSuccessMessage(''), 3000)
    } catch (error) {
      console.error('Error toggling strategy:', error)
      setErrorMessage(error instanceof Error ? error.message : 'Failed to update strategy')
    }
  }

  const togglePermission = async (selectedUserData: UserData, permissionType: 'can_generate_surveys' | 'can_use_speech_patterns') => {
    const newValue = !selectedUserData[permissionType]
    
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('value_graph_users')
        .update({ [permissionType]: newValue })
        .eq('id', selectedUserData.id)
      
      if (error) {
        console.error(`Error updating ${permissionType}:`, error)
        setErrorMessage(`Failed to update permission: ${error.message}`)
        return
      }
      
      // Update local state
      setUsers(prevUsers => 
        prevUsers.map(u => 
          u.id === selectedUserData.id 
            ? { ...u, [permissionType]: newValue }
            : u
        )
      )
      
      const permissionLabel = permissionType === 'can_generate_surveys' ? 'AI Predictions' : 'Chat Analytics'
      setSuccessMessage(`${permissionLabel} ${newValue ? 'enabled' : 'disabled'} for ${selectedUserData.name}`)
      setTimeout(() => setSuccessMessage(''), 3000)
    } catch (error) {
      console.error(`Error toggling ${permissionType}:`, error)
      setErrorMessage(error instanceof Error ? error.message : 'Failed to update permission')
    }
  }

  const viewUserData = (selectedUserData: UserData) => {
    router.push(`/admin/synthesis/${selectedUserData.id}`)
  }

  const viewUserVisualization = (selectedUserData: UserData) => {
    router.push(`/admin/visualization/${selectedUserData.id}`)
  }

  const exportUserChats = async (selectedUserData: UserData) => {
    try {
      const supabase = createClient()
      
      // Fetch all chatlog entries for the user
      const { data: chatEntries, error } = await supabase
        .from('chatlog')
        .select('*')
        .eq('user_id', selectedUserData.id)
        .order('timestamp', { ascending: true })
      
      if (error) {
        console.error('Error fetching chats:', error)
        alert('Error fetching chat data')
        return
      }
      
      // Group by session
      const entries: ChatlogEntry[] = (chatEntries ?? []) as ChatlogEntry[]
      type ExportEntry = {
        human_message: string
        llm_message: string
        timestamp: string
        formatted_date: string
        formatted_time: string
        strategy: string
      }
      const sessions: Record<string, ExportEntry[]> = {}
      entries.forEach((entry) => {
        const sessionId = entry.session_id ?? 'unknown'
        if (!sessions[sessionId]) {
          sessions[sessionId] = []
        }
        sessions[sessionId].push({
          human_message: entry.human_message,
          llm_message: entry.llm_message,
          timestamp: entry.timestamp,
          formatted_date: new Date(entry.timestamp).toLocaleDateString(),
          formatted_time: new Date(entry.timestamp).toLocaleTimeString(),
          strategy: new Date(entry.timestamp) < new Date('2025-07-22') ? 'vertical' : 'horizontal'
        })
      })
      
      const exportData = {
        user_name: selectedUserData.name,
        user_id: selectedUserData.id,
        export_date: new Date().toISOString(),
        total_sessions: Object.keys(sessions).length,
        total_messages: entries.length,
        sessions: sessions
      }
      
      // Create and download file
      const jsonString = JSON.stringify(exportData, null, 2)
      const blob = new Blob([jsonString], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      
      const link = document.createElement('a')
      link.href = url
      link.download = `${selectedUserData.name.replace(/[^a-zA-Z0-9]/g, '_')}-chats-export-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      
    } catch (error) {
      console.error('Error exporting chats:', error)
      alert('Error exporting chats')
    }
  }

  if (authIsLoading || !user) {
    return (
      <div className="fixed inset-0 min-h-full min-w-full flex flex-col items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mb-4"></div>
        <p className="text-muted-foreground">Loading authentication...</p>
      </div>
    )
  }
  if (!user.isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <p className="text-xl text-destructive">Access Denied</p>
        <p className="text-muted-foreground">You do not have permission to view this page.</p>
        <Button onClick={() => router.push('/')} className="mt-4">Go to Homepage</Button>
      </div>
    )
  }

  const totalDisplayedUsers = users.length
  const totalSessions = users.reduce((sum, u) => sum + u.sessionCount, 0)
  const totalValueNodes = users.reduce((sum, u) => sum + u.valueNodeCount, 0)

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8 max-w-7xl space-y-8">
      {/* Global notifications */}
      {successMessage && !isCreateUserDialogOpen && (
        <div className="bg-green-600/15 p-3 rounded-md border border-green-600/30 text-sm text-green-700 dark:text-green-400">
          {successMessage}
        </div>
      )}
      {errorMessage && !isCreateUserDialogOpen && (
        <div className="bg-destructive/15 p-3 rounded-md border border-destructive/30 text-sm text-destructive">
          {errorMessage}
        </div>
      )}
      
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Research Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Manage participants and view study data</p>
        </div>
        <Dialog open={isCreateUserDialogOpen} onOpenChange={setIsCreateUserDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-gray-900 hover:bg-gray-800 text-white">
              <PlusCircle className="mr-2 h-4 w-4" />
              Add Participant
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[480px] border-2 border-gray-200">
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold text-gray-900">Add Participant</DialogTitle>
              <DialogDescription className="text-sm text-gray-500">
                Add a new study participant. An access code will be auto-generated.
              </DialogDescription>
            </DialogHeader>
            {errorMessage && (
              <div className="my-3 bg-destructive/15 p-3 rounded-md border border-destructive/30 text-sm text-destructive">
                {errorMessage}
              </div>
            )}
            {successMessage && (
              <div className="my-3 bg-green-600/15 p-3 rounded-md border border-green-600/30 text-sm text-green-700 dark:text-green-400">
                {successMessage}
              </div>
            )}
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="name" className="text-right">Name</Label>
                <Input id="name" value={newUserData.name} onChange={(e) => setNewUserData({...newUserData, name: e.target.value})} placeholder="User's full name" className="col-span-3" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="email" className="text-right">Email</Label>
                <Input id="email" type="email" value={newUserData.email} onChange={(e) => setNewUserData({...newUserData, email: e.target.value})} placeholder="(Optional) user@example.com" className="col-span-3" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="accessCode" className="text-right">Access Code</Label>
                <Input id="accessCode" value={newUserData.accessCode} onChange={(e) => setNewUserData({...newUserData, accessCode: e.target.value})} placeholder="(Optional) Auto-generated if blank" className="col-span-3" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="isAdmin" className="text-right">Admin?</Label>
                <div className="col-span-3 flex items-center">
                  <label 
                    className="flex items-center gap-2 cursor-pointer"
                    onClick={() => setNewUserData({...newUserData, isAdmin: !newUserData.isAdmin})}
                  >
                    <span className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                      newUserData.isAdmin 
                        ? 'border-primary bg-primary' 
                        : 'border-gray-300 bg-white'
                    }`}>
                      {newUserData.isAdmin && (
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </span>
                    <span className="text-sm font-normal text-muted-foreground">Grant admin privileges</span>
                  </label>
                </div>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="strategyType" className="text-right">Strategy</Label>
                <div className="col-span-3 flex items-center gap-4">
                  <label 
                    className="flex items-center gap-2 cursor-pointer"
                    onClick={() => setNewUserData({...newUserData, strategyType: 'vertical'})}
                  >
                    <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      newUserData.strategyType === 'vertical' 
                        ? 'border-purple-600 bg-white' 
                        : 'border-gray-300 bg-white'
                    }`}>
                      {newUserData.strategyType === 'vertical' && (
                        <span className="w-2 h-2 rounded-full bg-purple-600" />
                      )}
                    </span>
                    <span className="text-sm flex items-center gap-1">
                      <ArrowDown size={14} className="text-purple-600" />
                      Vertical (Depth)
                    </span>
                  </label>
                  <label 
                    className="flex items-center gap-2 cursor-pointer"
                    onClick={() => setNewUserData({...newUserData, strategyType: 'horizontal'})}
                  >
                    <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      newUserData.strategyType === 'horizontal' 
                        ? 'border-teal-600 bg-white' 
                        : 'border-gray-300 bg-white'
                    }`}>
                      {newUserData.strategyType === 'horizontal' && (
                        <span className="w-2 h-2 rounded-full bg-teal-600" />
                      )}
                    </span>
                    <span className="text-sm flex items-center gap-1">
                      <ArrowRight size={14} className="text-teal-600" />
                      Horizontal (Breadth)
                    </span>
                  </label>
                </div>
              </div>
              <div className="grid grid-cols-4 items-start gap-4">
                <Label className="text-right pt-2">Permissions</Label>
                <div className="col-span-3 space-y-2">
                  <label 
                    className="flex items-center gap-2 cursor-pointer"
                    onClick={() => setNewUserData({...newUserData, canGenerateSurveys: !newUserData.canGenerateSurveys})}
                  >
                    <span className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                      newUserData.canGenerateSurveys 
                        ? 'border-green-600 bg-green-600' 
                        : 'border-gray-300 bg-white'
                    }`}>
                      {newUserData.canGenerateSurveys && (
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </span>
                    <span className="text-sm flex items-center gap-1.5">
                      <FileText size={14} className="text-gray-500" />
                      AI Predictions (run LLM predictions on chat history)
                    </span>
                  </label>
                  <label 
                    className="flex items-center gap-2 cursor-pointer"
                    onClick={() => setNewUserData({...newUserData, canUseSpeechPatterns: !newUserData.canUseSpeechPatterns})}
                  >
                    <span className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                      newUserData.canUseSpeechPatterns 
                        ? 'border-green-600 bg-green-600' 
                        : 'border-gray-300 bg-white'
                    }`}>
                      {newUserData.canUseSpeechPatterns && (
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </span>
                    <span className="text-sm flex items-center gap-1.5">
                      <Mic size={14} className="text-gray-500" />
                      Chat Analytics (view speech pattern analysis)
                    </span>
                  </label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Users without permissions can provide their own API keys to use these features.
                  </p>
                </div>
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" className="border-gray-200" onClick={() => { setIsCreateUserDialogOpen(false); setErrorMessage(''); setSuccessMessage(''); }}>Cancel</Button>
              <Button className="bg-gray-900 hover:bg-gray-800 text-white" onClick={handleCreateUser}>Add Participant</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      
      <Tabs defaultValue="users" className="w-full">
        <TabsList className="grid w-full grid-cols-2 h-11 bg-gray-100 p-1 rounded-lg">
          <TabsTrigger value="users" className="text-sm font-medium flex items-center gap-2 rounded-md data-[state=active]:bg-white ">
            <Users className="h-4 w-4" />Participants
          </TabsTrigger>
          <TabsTrigger value="analytics" className="text-sm font-medium flex items-center gap-2 rounded-md data-[state=active]:bg-white ">
            <BarChart className="h-4 w-4" />Study Analytics
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="users" className="mt-6">
          <Card className="border-2 border-gray-200 shadow-none">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-semibold text-gray-900">Study Participants</CardTitle>
              <CardDescription className="text-sm text-gray-500">Manage participants, view chat sessions, and analyze Topic-Context Graph data.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingUsers ? (
                <div className="flex flex-col items-center justify-center py-10">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mb-3"></div>
                  <p className="text-muted-foreground">Loading user data...</p>
                </div>
              ) : users.length === 0 ? (
                <div className="text-center py-10 text-gray-500">No other users found.</div>
              ) : (
                <div className="relative overflow-x-auto border-2 border-gray-200 rounded-lg">
                  <table className="w-full text-sm text-left text-gray-600">
                    <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th scope="col" className="px-4 py-3 font-medium">Name</th>
                        <th scope="col" className="px-4 py-3 font-medium">Access Code</th>
                        <th scope="col" className="px-4 py-3 text-center font-medium">Sessions</th>
                        <th scope="col" className="px-4 py-3 text-center font-medium">TCG Nodes</th>
                        <th scope="col" className="px-4 py-3 font-medium">Strategy</th>
                        <th scope="col" className="px-4 py-3 text-center font-medium">Permissions</th>
                        <th scope="col" className="px-4 py-3 font-medium">Role</th>
                        <th scope="col" className="px-4 py-3 text-center font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {users.map((u) => (
                        <tr key={u.id} className="bg-white hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-900">{u.name}</div>
                            {u.email && <div className="text-xs text-gray-500">{u.email}</div>}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-gray-600">{u.access_code}</td>
                          <td className="px-4 py-3 text-center text-gray-900">{u.sessionCount}</td>
                          <td className="px-4 py-3 text-center text-gray-900">{u.valueNodeCount}</td>
                          <td className="px-4 py-3">
                            <button 
                              onClick={() => toggleStrategyType(u)}
                              className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded transition-colors ${
                                u.strategy_type === 'vertical' 
                                  ? 'bg-purple-100 text-purple-700 hover:bg-purple-200' 
                                  : 'bg-teal-100 text-teal-700 hover:bg-teal-200'
                              }`}
                              title={`Click to switch to ${u.strategy_type === 'vertical' ? 'horizontal' : 'vertical'}`}
                            >
                              {u.strategy_type === 'vertical' ? (
                                <>
                                  <ArrowDown size={12} />
                                  Vertical
                                </>
                              ) : (
                                <>
                                  <ArrowRight size={12} />
                                  Horizontal
                                </>
                              )}
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-1">
                              <button
                                onClick={() => togglePermission(u, 'can_generate_surveys')}
                                className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${
                                  u.can_generate_surveys 
                                    ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' 
                                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                }`}
                                title={`Click to ${u.can_generate_surveys ? 'disable' : 'enable'} AI predictions`}
                              >
                                {u.can_generate_surveys ? <Check size={10} /> : <X size={10} />}
                                AI Predictions
                              </button>
                              <button
                                onClick={() => togglePermission(u, 'can_use_speech_patterns')}
                                className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${
                                  u.can_use_speech_patterns 
                                    ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' 
                                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                }`}
                                title={`Click to ${u.can_use_speech_patterns ? 'disable' : 'enable'} chat analytics`}
                              >
                                {u.can_use_speech_patterns ? <Check size={10} /> : <X size={10} />}
                                Chat Analytics
                              </button>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {u.is_admin ? (
                              <span className="inline-flex items-center gap-1 py-0.5 px-2 rounded-full text-xs font-medium bg-gray-900 text-white">
                                Admin
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 py-0.5 px-2 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                                User
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex flex-wrap justify-center gap-1">
                              <button 
                                onClick={() => viewUserData(u)}
                                className="flex items-center gap-1 text-xs px-2 py-1.5 rounded bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors"
                                title="Generate Topic-Context Graph from chat history"
                              >
                                <Activity className="h-3 w-3" />
                                TCG
                              </button>
                              <button 
                                onClick={() => viewUserVisualization(u)} 
                                className="flex items-center gap-1 text-xs px-2 py-1.5 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
                                title="View Topic-Context Graph visualization"
                              >
                                <BarChart className="h-3 w-3" />
                                View
                              </button>
                              <button 
                                onClick={() => router.push(`/admin/strategies/${u.id}`)} 
                                className="flex items-center gap-1 text-xs px-2 py-1.5 rounded bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
                                title="View conversation strategies"
                              >
                                <MessageSquareText className="h-3 w-3" />
                                Strats
                              </button>
                              <button 
                                onClick={() => exportUserChats(u)} 
                                className="flex items-center gap-1 text-xs px-2 py-1.5 rounded bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors"
                                title="Export chat logs as JSON"
                              >
                                <Download className="h-3 w-3" />
                                Export
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="analytics" className="mt-6">
          <Card className="border-2 border-gray-200 shadow-none">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-semibold text-gray-900">Study Analytics</CardTitle>
              <CardDescription className="text-sm text-gray-500">Aggregate data across all study participants.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatCard title="Participants" value={totalDisplayedUsers} description="Study participants (non-admin)" />
                <StatCard title="Chat Sessions" value={totalSessions} description="Total conversations with Day" />
                <StatCard title="TCG Nodes" value={totalValueNodes} description="Topic-context nodes extracted"/>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
} 