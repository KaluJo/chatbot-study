import React from 'react';
import { VisualizationWrapper } from '@/components/admin/VisualizationWrapper';
import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

type PageParams = {
  userId: string;
};

// Server component to fetch user data and render client visualization component
export default async function UserVisualizationPage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  // Await params before using its properties
  const resolvedParams = await params;
  const userId = resolvedParams.userId;
  const supabase = await createClient();
  
  // Verify this is a valid user
  const { data: user, error } = await supabase
    .from('value_graph_users')
    .select('id, name, email')
    .eq('id', userId)
    .single();
  
  if (error || !user) {
    console.error('Error fetching user:', error);
    redirect('/admin/dashboard');
  }
  
  // Initialize count variables
  let topicsCount = 0;
  let nodesCount = 0;
  let itemsCount = 0;
  
  try {
    // First try to get counts via the RPC function
    const { data: counts, error: countsError } = await supabase.rpc('get_user_data_counts', {
      user_id_param: userId
    });
    
    if (countsError) {
      throw countsError;
    }
    
    // RPC returns an array of rows, get the first one
    const countData = Array.isArray(counts) ? counts[0] : counts;
    topicsCount = countData?.topics_count || 0;
    nodesCount = countData?.nodes_count || 0;
    itemsCount = countData?.items_count || 0;
    
  } catch (err) {
    console.warn('Falling back to direct count queries:', err);
    
    // If RPC fails, do individual count queries
    const topicsResult = await supabase
      .from('topics')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);
      
    const nodesResult = await supabase
      .from('value_nodes')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);
      
    const itemsResult = await supabase
      .from('items')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);
    
    topicsCount = topicsResult.count || 0;
    nodesCount = nodesResult.count || 0;
    itemsCount = itemsResult.count || 0;
  }
  
  return (
    <main className="flex flex-col h-[calc(100vh-120px)]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
            Topic-Context Graph
          </h1>
          <p className="text-sm text-gray-500">
            {user.name || user.email}
          </p>
        </div>
        <div className="flex gap-2">
          <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium">
            {topicsCount} Topics
          </span>
          <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-medium">
            {nodesCount} Nodes
          </span>
          <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">
            {itemsCount} Items
          </span>
        </div>
      </div>
      
      {/* Client-side visualization component - takes remaining height */}
      <div className="flex-1 min-h-0 border-2 border-gray-200 rounded-lg overflow-hidden">
        <VisualizationWrapper userId={userId} />
      </div>
    </main>
  );
}
