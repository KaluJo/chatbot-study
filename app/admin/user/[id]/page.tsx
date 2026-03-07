'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArrowLeft, User, MessageSquare, GitGraph } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'

// Define types
type UserData = {
  id: string
  name: string
  email?: string
  access_code: string
  is_admin: boolean
  created_at: string
}

type ChatData = {
  id: string
  created_at: string
  recent_messages: { llm_message: string; human_message: string }[]
}

type ValueData = {
  id: string
  topic: string
  context: string
  score: number
  reasoning: string
}

export default function UserDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const { user, isLoading } = useAuth()
  const [userData, setUserData] = useState<UserData | null>(null)
  const [chatData, setChatData] = useState<ChatData[]>([])
  const [valueData, setValueData] = useState<ValueData[]>([])
  const [isLoading2, setIsLoading2] = useState(true)

  // Redirect if not admin
  useEffect(() => {
    if (!isLoading && (!user || !user.isAdmin)) {
      router.push('/')
    }
  }, [user, isLoading, router])

  // Load user data
  useEffect(() => {
    if (!user?.isAdmin || !id) return

    const loadUserDetails = async () => {
      setIsLoading2(true)
      const supabase = createClient()

      try {
        // Set admin context
        await supabase.rpc('set_user_context', {
          user_id: user.id,
          is_admin: true
        })

        // Get user info
        const { data: userData, error: userError } = await supabase
          .from('value_graph_users')
          .select('*')
          .eq('id', id)
          .single()

        if (userError) throw userError
        setUserData(userData)

        // Get user's chats
        const { data: chats, error: chatsError } = await supabase
          .from('chat_windows')
          .select('id, created_at')
          .eq('user_id', id)
          .order('created_at', { ascending: false })

        if (chatsError) throw chatsError

        // For each chat, get recent messages
        const enhancedChats = await Promise.all(chats.map(async (chat) => {
          const { data: messages } = await supabase
            .from('chatlog')
            .select('llm_message, human_message')
            .eq('chat_window_id', chat.id)
            .order('created_at', { ascending: false })
            .limit(3)

          return {
            ...chat,
            recent_messages: messages || []
          }
        }))

        setChatData(enhancedChats)

        // Get user's value nodes
        const { data: valueNodes, error: valuesError } = await supabase
          .from('value_nodes')
          .select(`
            id, 
            score, 
            reasoning,
            topics:topic_id (id, label),
            contexts:context_id (id, name)
          `)
          .eq('user_id', id)
          .order('created_at', { ascending: false })

        if (valuesError) throw valuesError

        // Transform value nodes data
        const transformedValues = valueNodes.map((node: any) => ({
          id: node.id,
          topic: node.topics?.label || 'Unknown Topic',
          context: node.contexts?.name || 'Unknown Context',
          score: node.score,
          reasoning: node.reasoning || 'No reasoning provided'
        }))

        setValueData(transformedValues)
      } catch (error) {
        console.error('Error loading user details:', error)
      } finally {
        setIsLoading2(false)
      }
    }

    loadUserDetails()
  }, [id, user])

  if (isLoading || !user) {
    return <div className="flex justify-center items-center min-h-[70vh]">Loading...</div>
  }

  if (!user.isAdmin) {
    return <div className="text-center p-8">You don't have permission to access this page.</div>
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="flex items-center mb-6">
        <Button variant="outline" size="icon" asChild className="mr-4">
          <Link href="/admin/dashboard">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-3xl font-bold">User Details</h1>
      </div>

      {isLoading2 ? (
        <div className="flex justify-center items-center min-h-[50vh]">Loading user data...</div>
      ) : !userData ? (
        <div className="text-center p-8">User not found</div>
      ) : (
        <>
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center">
                <User className="mr-2 h-5 w-5" />
                {userData.name}
                {userData.is_admin && (
                  <span className="ml-2 text-xs bg-primary/20 text-primary px-2 py-1 rounded-full">
                    Admin
                  </span>
                )}
              </CardTitle>
              <CardDescription>
                User ID: {userData.id}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium">Email</p>
                  <p className="text-muted-foreground">{userData.email || 'No email provided'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">Access Code</p>
                  <p className="font-mono">{userData.access_code}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">Account Created</p>
                  <p className="text-muted-foreground">{new Date(userData.created_at).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">Status</p>
                  <p className="text-muted-foreground">Active</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Tabs defaultValue="chats" className="w-full">
            <TabsList className="mb-6">
              <TabsTrigger value="chats" className="flex items-center">
                <MessageSquare className="mr-2 h-4 w-4" />
                Conversations ({chatData.length})
              </TabsTrigger>
              <TabsTrigger value="values" className="flex items-center">
                <GitGraph className="mr-2 h-4 w-4" />
                Value Nodes ({valueData.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="chats" className="space-y-6">
              {chatData.length === 0 ? (
                <Card>
                  <CardContent className="text-center py-8">
                    <p>This user has no conversations yet.</p>
                  </CardContent>
                </Card>
              ) : (
                chatData.map((chat) => (
                  <Card key={chat.id}>
                    <CardHeader>
                      <CardTitle>{`Chat ${chat.id.substring(0, 8)}`}</CardTitle>
                      <CardDescription>
                        Created: {new Date(chat.created_at).toLocaleString()}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {chat.recent_messages.length > 0 ? (
                        <div className="space-y-4">
                          <h3 className="text-sm font-medium">Recent Messages:</h3>
                          {chat.recent_messages.map((msg, index) => (
                            <div key={index} className="border-l-2 border-muted pl-4 py-1">
                              {msg.llm_message && (
                                <p className="text-sm font-medium">Q: {msg.llm_message}</p>
                              )}
                              {msg.human_message && (
                                <p className="text-muted-foreground text-sm">A: {msg.human_message}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-muted-foreground">No messages in this conversation.</p>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            <TabsContent value="values" className="space-y-6">
              {valueData.length === 0 ? (
                <Card>
                  <CardContent className="text-center py-8">
                    <p>This user has no value nodes yet.</p>
                  </CardContent>
                </Card>
              ) : (
                valueData.map((value) => (
                  <Card key={value.id}>
                    <CardHeader>
                      <CardTitle className="text-lg">{value.topic}</CardTitle>
                      <CardDescription>
                        Context: {value.context}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div>
                          <p className="text-sm font-medium">
                            Score: <span className={value.score > 0 ? 'text-green-600' : value.score < 0 ? 'text-red-600' : ''}>
                              {value.score > 0 ? '+' : ''}{value.score}
                            </span>
                          </p>
                        </div>
                        <div>
                          <p className="text-sm font-medium">Reasoning:</p>
                          <p className="text-muted-foreground text-sm whitespace-pre-wrap">{value.reasoning}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  )
} 