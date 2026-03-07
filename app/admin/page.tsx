'use client'

import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { PlusCircle, UserCircle, ShieldCheck, Download } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { createClient } from '@/utils/supabase/client'

export default function AdminPage() {
  const { user, isLoading, createUser } = useAuth()
  const router = useRouter()
  const [users, setUsers] = useState<any[]>([])
  const [isDataLoading, setIsDataLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    accessCode: ''
  })
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [createdAccessCode, setCreatedAccessCode] = useState<string | null>(null)

  // Redirect if not admin
  useEffect(() => {
    if (!isLoading && (!user || !user.isAdmin)) {
      router.push('/')
    }
  }, [user, isLoading, router])

  // Load users when admin user is available
  useEffect(() => {
    if (!user || !user.isAdmin) return

    const loadUsers = async () => {
      setIsDataLoading(true)
      const supabase = createClient()
      
      try {
        // Set user context
        await supabase.rpc('set_user_context', {
          user_id: user.id,
          is_admin: user.isAdmin
        })
        
        // Get users - only admins can access this data
        const { data, error } = await supabase
          .from('value_graph_users')
          .select('id, name, email, is_admin, created_at')
          .order('created_at', { ascending: false })
        
        if (error) throw error
        
        if (data) {
          setUsers(data)
        }
      } catch (error) {
        console.error('Error loading users:', error)
      } finally {
        setIsDataLoading(false)
      }
    }
    
    loadUsers()
  }, [user])

  const handleCreateUser = async () => {
    setErrorMessage(null)
    setSuccessMessage(null)
    setCreatedAccessCode(null)
    
    if (!newUser.name) {
      setErrorMessage('Name is required')
      return
    }
    
    try {
      const result = await createUser(
        newUser.name, 
        newUser.email || undefined, 
        newUser.accessCode || undefined
      )
      
      if (result.success) {
        setSuccessMessage('User created successfully')
        if (result.generatedCode) {
          setCreatedAccessCode(result.generatedCode)
        }
        
        // Reset form and refresh users list
        setNewUser({
          name: '',
          email: '',
          accessCode: ''
        })
        
        // Refresh users list
        const supabase = createClient()
        const { data } = await supabase
          .from('value_graph_users')
          .select('id, name, email, is_admin, created_at')
          .order('created_at', { ascending: false })
        
        if (data) {
          setUsers(data)
        }
      } else {
        setErrorMessage(result.message)
      }
    } catch (error) {
      setErrorMessage('An error occurred while creating the user')
      console.error(error)
    }
  }

  const handleExportChats = (userId: string, userName: string) => {
    alert(`Export chats for ${userName} (ID: ${userId})`)
  }

  if (isLoading || !user) {
    return (
      <div className="fixed inset-0 min-h-full min-w-full flex flex-col items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mb-4"></div>
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (!user.isAdmin) {
    return <div className="text-center">You don't have permission to access this page.</div>
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div className="flex items-center">
          <h1 className="text-3xl font-bold mr-2">Admin Panel</h1>
          <ShieldCheck className="h-6 w-6 text-primary" />
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <PlusCircle className="mr-2 h-4 w-4" /> Add User
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New User</DialogTitle>
              <DialogDescription>
                Add a new user to the Values Graph system
              </DialogDescription>
            </DialogHeader>
            
            {errorMessage && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            )}
            
            {successMessage && (
              <Alert className="mb-4">
                <AlertDescription>{successMessage}</AlertDescription>
              </Alert>
            )}
            
            {createdAccessCode && (
              <div className="bg-muted p-4 rounded-md mb-4">
                <p className="font-medium mb-1">Generated Access Code:</p>
                <p className="font-mono bg-background p-2 rounded">{createdAccessCode}</p>
                <p className="text-xs text-muted-foreground mt-2">Share this code with the user to allow them to log in.</p>
              </div>
            )}
            
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={newUser.name}
                  onChange={(e) => setNewUser({...newUser, name: e.target.value})}
                  placeholder="User's full name"
                />
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="email">Email (optional)</Label>
                <Input
                  id="email"
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                  placeholder="user@example.com"
                />
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="accessCode">
                  Access Code (optional)
                </Label>
                <Input
                  id="accessCode"
                  value={newUser.accessCode}
                  onChange={(e) => setNewUser({...newUser, accessCode: e.target.value})}
                  placeholder="Custom access code or leave blank to generate"
                />
                <p className="text-xs text-muted-foreground">
                  If left blank, a random access code will be generated
                </p>
              </div>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateUser}>
                Create User
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      
      <h2 className="text-xl font-semibold mt-8 mb-4">Manage Users</h2>
      
      {successMessage && (
        <Alert className="mb-4">
          <AlertDescription>{successMessage}</AlertDescription>
        </Alert>
      )}
      
      {errorMessage && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}
      
      {isDataLoading ? (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mb-3"></div>
          <p className="text-muted-foreground">Loading users...</p>
        </div>
      ) : users.length > 0 ? (
        <div className="grid grid-cols-1 gap-4">
          {users.map((user) => (
            <Card key={user.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center">
                  {user.name}
                  {user.is_admin && (
                    <span className="ml-2 text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">
                      Admin
                    </span>
                  )}
                </CardTitle>
                <CardDescription>
                  {user.email || 'No email provided'} • Created {new Date(user.created_at).toLocaleDateString()}
                </CardDescription>
              </CardHeader>
              <CardFooter className="pt-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => handleExportChats(user.id, user.name)}
                  className="flex items-center gap-2"
                >
                  <Download className="h-4 w-4" />
                  Export
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <h3 className="font-medium text-lg mb-2">No users found</h3>
              <p className="text-muted-foreground mb-4">Start by creating a new user</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
} 