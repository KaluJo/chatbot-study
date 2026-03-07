'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/utils/supabase/client';
import { getUserStrategies, ConversationStrategy } from '@/app/chat/services/strategy-service';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Activity, ArrowLeft, Clock, Loader2, MoreHorizontal, Sun, SunMoon, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface UserDetails {
  id: string;
  name: string;
  email?: string;
}

interface StrategyWithMetadata {
  id?: string;
  sessionId: string;
  strategy: ConversationStrategy;
  createdAt: string;
  timeOfDay?: string;
}

const UserStrategiesPage: React.FC = () => {
  const params = useParams();
  const router = useRouter();
  const { user: adminUser, isLoading: authIsLoading } = useAuth();
  
  const targetUserId = Array.isArray(params.userId) ? params.userId[0] : params.userId;
  const [targetUserDetails, setTargetUserDetails] = useState<UserDetails | null>(null);
  
  const [strategies, setStrategies] = useState<StrategyWithMetadata[]>([]);
  const [isLoadingStrategies, setIsLoadingStrategies] = useState(true);
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyWithMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Fetch user details
  useEffect(() => {
    if (targetUserId) {
      const fetchUserDetails = async () => {
        const supabase = createClient();
        const { data, error: userError } = await supabase
          .from('value_graph_users')
          .select('id, name, email')
          .eq('id', targetUserId)
          .single();
          
        if (userError) {
          setError("Could not load user details.");
        } else if (data) {
          setTargetUserDetails(data);
        }
      };
      
      fetchUserDetails();
    }
  }, [targetUserId]);
  
  // Check admin authorization
  useEffect(() => {
    if (!authIsLoading && (!adminUser || !adminUser.isAdmin)) {
      router.replace('/login?callbackUrl=' + encodeURIComponent(window.location.pathname));
    }
  }, [adminUser, authIsLoading, router]);
  
  // Load strategies
  useEffect(() => {
    const loadStrategies = async () => {
      if (!targetUserId || !adminUser?.isAdmin) return;
      
      setIsLoadingStrategies(true);
      setError(null);
      
      try {
        const result = await getUserStrategies(targetUserId);
        
        if (result.success && result.data) {
          // Now fetch the strategy IDs from the database
          const supabase = createClient();
          const { data: strategyData, error: strategyError } = await supabase
            .from('conversation_strategies')
            .select('id, session_id')
            .eq('user_id', targetUserId);
            
          if (strategyError) {
            console.error('Error fetching strategy IDs:', strategyError);
          } else if (strategyData) {
            // Create a map of session IDs to strategy IDs
            const sessionToIdMap = strategyData.reduce((map, item) => {
              map[item.session_id] = item.id;
              return map;
            }, {} as Record<string, string>);
            
            // Enhance the strategy data with IDs
            const enhancedStrategies = result.data.map(strategy => ({
              ...strategy,
              id: sessionToIdMap[strategy.sessionId]
            }));
            
            setStrategies(enhancedStrategies);
          }
        } else {
          setError(result.error || 'Failed to load strategies');
          setStrategies([]);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error loading strategies');
        setStrategies([]);
      } finally {
        setIsLoadingStrategies(false);
      }
    };
    
    loadStrategies();
  }, [targetUserId, adminUser]);
  
  const handleStrategySelect = (strategy: StrategyWithMetadata) => {
    setSelectedStrategy(strategy);
  };
  
  const handleDeleteStrategy = async (strategyId: string) => {
    if (!strategyId) return;
    
    if (!confirm('Are you sure you want to delete this strategy?')) {
      return;
    }
    
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('conversation_strategies')
        .delete()
        .eq('id', strategyId);
        
      if (error) {
        setError(`Failed to delete strategy: ${error.message}`);
      } else {
        // Remove the strategy from the list
        setStrategies(strategies.filter(s => s.id !== strategyId));
        if (selectedStrategy?.id === strategyId) {
          setSelectedStrategy(null);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error deleting strategy');
    }
  };
  
  // Add function to identify and clean up duplicate strategies
  const handleCleanupDuplicates = async () => {
    if (!targetUserId || strategies.length === 0) return;
    
    if (!confirm('This will identify strategies created within 5 seconds of each other for the same session and remove duplicates. Continue?')) {
      return;
    }
    
    setIsLoadingStrategies(true);
    setError(null);
    
    try {
      // Group strategies by session
      const sessionGroups: Record<string, StrategyWithMetadata[]> = {};
      
      strategies.forEach(strategy => {
        if (!sessionGroups[strategy.sessionId]) {
          sessionGroups[strategy.sessionId] = [];
        }
        sessionGroups[strategy.sessionId].push(strategy);
      });
      
      // Find sessions with multiple strategies created close together (within 5 seconds)
      const duplicatesFound: string[] = [];
      const strategiesToKeep: StrategyWithMetadata[] = [];
      
      Object.entries(sessionGroups).forEach(([sessionId, sessionStrategies]) => {
        if (sessionStrategies.length > 1) {
          // Sort by creation date (oldest first)
          sessionStrategies.sort((a, b) => 
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
          
          // Check if any were created within 5 seconds of each other
          const duplicates: StrategyWithMetadata[] = [];
          let previousStrategy = sessionStrategies[0];
          strategiesToKeep.push(previousStrategy); // Keep the oldest one
          
          for (let i = 1; i < sessionStrategies.length; i++) {
            const currentStrategy = sessionStrategies[i];
            const timeDifference = Math.abs(
              new Date(currentStrategy.createdAt).getTime() - 
              new Date(previousStrategy.createdAt).getTime()
            );
            
            // If created within 5 seconds, mark as duplicate
            if (timeDifference <= 5000) {
              duplicates.push(currentStrategy);
              duplicatesFound.push(currentStrategy.id!);
            } else {
              // Not a duplicate, keep it
              strategiesToKeep.push(currentStrategy);
              previousStrategy = currentStrategy;
            }
          }
          
          console.log(`Session ${sessionId}: Found ${duplicates.length} duplicates`);
        } else {
          // Only one strategy for this session, keep it
          strategiesToKeep.push(sessionStrategies[0]);
        }
      });
      
      // Delete duplicate strategies
      if (duplicatesFound.length > 0) {
        const supabase = createClient();
        
        for (const id of duplicatesFound) {
          const { error } = await supabase
            .from('conversation_strategies')
            .delete()
            .eq('id', id);
            
          if (error) {
            console.error(`Error deleting duplicate strategy ${id}:`, error);
          }
        }
        
        // Update strategies list
        setStrategies(strategiesToKeep);
        setSelectedStrategy(null);
        
        alert(`Cleanup complete! Removed ${duplicatesFound.length} duplicate strategies.`);
      } else {
        alert('No duplicate strategies found.');
      }
      
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cleaning up duplicates');
    } finally {
      setIsLoadingStrategies(false);
    }
  };
  
  // Format date for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };
  
  // Icon for time of day
  const getTimeIcon = (timeOfDay?: string) => {
    switch (timeOfDay) {
      case 'morning':
        return <Sun className="h-4 w-4 text-yellow-500" />;
      case 'afternoon':
        return <Sun className="h-4 w-4 text-orange-500" />;
      case 'evening':
        return <SunMoon className="h-4 w-4 text-blue-500" />;
      case 'night':
        return <SunMoon className="h-4 w-4 text-indigo-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };
  
  if (authIsLoading || !adminUser?.isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4"/>
        <p className="text-muted-foreground">Loading user data...</p>
      </div>
    );
  }
  
  return (
    <div className="p-6 space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-6 w-6 text-primary"/> 
              Conversation Strategies for {targetUserDetails?.name || targetUserId}
            </CardTitle>
            <Button variant="outline" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </div>
          <CardDescription>
            View generated conversation strategies for this user.
            <Button 
              variant="link" 
              size="sm" 
              onClick={handleCleanupDuplicates} 
              className="ml-2 text-xs"
              disabled={strategies.length === 0 || isLoadingStrategies}
            >
              Clean up duplicates
            </Button>
          </CardDescription>
        </CardHeader>
      </Card>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Strategy Sessions</CardTitle>
              <CardDescription>
                {strategies.length} strategies found
              </CardDescription>
            </CardHeader>
            <CardContent className="max-h-[70vh] overflow-y-auto space-y-2 p-0">
              {isLoadingStrategies ? (
                <div className="p-4 text-center">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2"/>
                  <p className="text-sm text-muted-foreground">Loading strategies...</p>
                </div>
              ) : strategies.length === 0 ? (
                <div className="p-4 text-center">
                  <p className="text-sm text-muted-foreground">No strategies found for this user.</p>
                </div>
              ) : (
                <div className="divide-y">
                  {strategies.map((strategy, index) => (
                    <div 
                      key={strategy.id || strategy.sessionId}
                      className="relative p-4 hover:bg-accent/50 cursor-pointer"
                    >
                      <div 
                        className="flex items-start gap-3"
                        onClick={() => handleStrategySelect(strategy)}
                      >
                        <div className="mt-1">
                          {getTimeIcon(strategy.timeOfDay)}
                        </div>
                        <div className="flex-1">
                          <p className={`font-medium text-sm ${selectedStrategy?.sessionId === strategy.sessionId ? 'text-primary' : ''}`}>
                            Session: {strategy.sessionId.substring(0, 8)}...
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Created: {formatDate(strategy.createdAt)}
                          </p>
                          {strategy.timeOfDay && (
                            <Badge variant="outline" className="mt-1 text-xs">
                              {strategy.timeOfDay}
                            </Badge>
                          )}
                        </div>
                      </div>
                      
                      <Popover>
                        <PopoverTrigger className="absolute top-2 right-2 opacity-60 hover:opacity-100">
                          <MoreHorizontal className="h-4 w-4" />
                        </PopoverTrigger>
                        <PopoverContent className="w-40 p-0" side="right">
                          <Button
                            variant="ghost"
                            className="w-full justify-start text-destructive hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              strategy.id && handleDeleteStrategy(strategy.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </Button>
                        </PopoverContent>
                      </Popover>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        
        <div className="md:col-span-2">
          {selectedStrategy ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Strategy Details
                  <Badge className="ml-2">
                    {getTimeIcon(selectedStrategy.timeOfDay)}
                    <span className="ml-1">{selectedStrategy.timeOfDay || 'Unknown time'}</span>
                  </Badge>
                </CardTitle>
                <CardDescription>
                  Session: {selectedStrategy.sessionId}
                  <br />
                  Created: {formatDate(selectedStrategy.createdAt)}
                </CardDescription>
              </CardHeader>
              <CardContent className="max-h-[70vh] overflow-y-auto space-y-4">
                <Accordion type="single" collapsible className="space-y-4">
                  <AccordionItem value="insights" className="border rounded-lg px-4">
                    <AccordionTrigger className="py-3 hover:no-underline">
                      <span className="font-semibold">Insights</span>
                      <Badge className="ml-2">{selectedStrategy.strategy.insights?.length || 0}</Badge>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-3 mt-1 mb-3">
                        {selectedStrategy.strategy.insights?.map((insight, idx) => (
                          <div key={idx} className="border rounded-lg p-3">
                            <h4 className="font-medium">{insight.pattern}</h4>
                            <p className="text-sm text-primary mt-1">Approach: {insight.approach}</p>
                          </div>
                        )) || <p className="text-muted-foreground">No insights available</p>}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                  
                  <AccordionItem value="memories" className="border rounded-lg px-4">
                    <AccordionTrigger className="py-3 hover:no-underline">
                      <span className="font-semibold">Shared Memories</span>
                      <Badge className="ml-2">{selectedStrategy.strategy.shared_memories?.length || 0}</Badge>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-3 mt-1 mb-3">
                        {selectedStrategy.strategy.shared_memories?.map((memory, idx) => (
                          <div key={idx} className="border rounded-lg p-3">
                            <div className="flex justify-between">
                              <h4 className="font-medium">{memory.memory_type} ({memory.when_it_happened})</h4>
                            </div>
                            <p className="text-sm mt-1">{memory.what_happened}</p>
                            <p className="text-sm text-primary mt-1">Reference: "{memory.how_to_reference}"</p>
                          </div>
                        )) || <p className="text-muted-foreground">No shared memories available</p>}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                  
                  <AccordionItem value="commguide" className="border rounded-lg px-4">
                    <AccordionTrigger className="py-3 hover:no-underline">
                      <span className="font-semibold">User Profile</span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="border rounded-lg p-3 mt-1 mb-3">
                        <p className="text-sm">{selectedStrategy.strategy.user_profile || 'No user profile available'}</p>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                  
                  <AccordionItem value="goals" className="border rounded-lg px-4">
                    <AccordionTrigger className="py-3 hover:no-underline">
                      <span className="font-semibold">Conversation Goals</span>
                      <Badge className="ml-2">{selectedStrategy.strategy.conversation_goals?.length || 0}</Badge>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-2 mt-1 mb-3">
                        {selectedStrategy.strategy.conversation_goals?.map((goal, idx) => (
                          <div key={idx} className="border rounded-lg p-3">
                            <p>{goal}</p>
                          </div>
                        )) || <p className="text-muted-foreground">No goals available</p>}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>
          ) : (
            <Card className="h-full flex items-center justify-center">
              <CardContent className="text-center pt-6">
                <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4"/>
                <p className="text-muted-foreground">Select a strategy from the list to view details.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      
      {error && (
        <div className="bg-destructive/10 text-destructive p-4 rounded-md">
          {error}
        </div>
      )}
    </div>
  );
};

export default UserStrategiesPage; 