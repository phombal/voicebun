'use client'

import Link from 'next/link'
import { Mic, Sparkles, Code, MessageSquare, ArrowRight, Users, Play, Clock, User, Globe } from 'lucide-react'
import { useEffect, useState } from 'react'

interface PublicProject {
  id: string;
  name: string;
  description: string | null;
  user_name: string | null;
  user_email: string;
  created_at: string;
  project_data?: {
    public_title?: string;
    public_description?: string;
    public_welcome_message?: string;
    project_emoji?: string;
    project_photo?: string;
    system_prompt: string;
    tts_provider: string;
    tts_voice: string;
    llm_model: string;
  };
}

export default function LandingPage() {
  const [featuredProjects, setFeaturedProjects] = useState<PublicProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);

  useEffect(() => {
    fetchFeaturedProjects();
  }, []);

  const fetchFeaturedProjects = async () => {
    try {
      setProjectsLoading(true);
      const response = await fetch('/api/community/projects');
      if (!response.ok) {
        throw new Error('Failed to fetch projects');
      }
      const data = await response.json();
      // Get first 6 projects as featured
      setFeaturedProjects((data.projects || []).slice(0, 6));
    } catch (err) {
      console.error('Failed to load featured projects:', err);
      setFeaturedProjects([]);
    } finally {
      setProjectsLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const ProjectCard = ({ project }: { project: PublicProject }) => {
    const displayTitle = project.project_data?.public_title || project.name;
    const displayDescription = project.project_data?.public_description || project.description || 'No description available';
    const emoji = project.project_data?.project_emoji || '🤖';
    
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-6 hover:border-gray-300 hover:shadow-lg transition-all duration-200 group">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="text-2xl">{emoji}</div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                {displayTitle}
              </h3>
              <div className="flex items-center text-sm text-gray-500 mt-1">
                <User className="w-3 h-3 mr-1" />
                <span>{project.user_name || 'Anonymous'}</span>
                <span className="mx-2">•</span>
                <Clock className="w-3 h-3 mr-1" />
                <span>{formatDate(project.created_at)}</span>
              </div>
            </div>
          </div>
          <button className="opacity-0 group-hover:opacity-100 transition-opacity bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-lg">
            <Play className="w-4 h-4" />
          </button>
        </div>
        
        <p className="text-gray-600 mb-4 line-clamp-3">
          {displayDescription}
        </p>
        
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4 text-sm text-gray-500">
            <div className="flex items-center">
              <Mic className="w-4 h-4 mr-1" />
              <span>{project.project_data?.tts_provider || 'Voice'}</span>
            </div>
            <div className="flex items-center">
              <Sparkles className="w-4 h-4 mr-1" />
              <span>{project.project_data?.llm_model || 'AI'}</span>
            </div>
          </div>
          
          <Link
            href={`/community/${project.id}`}
            className="text-blue-600 hover:text-blue-700 transition-colors flex items-center text-sm font-medium"
          >
            Try Now
            <ArrowRight className="w-4 h-4 ml-1" />
          </Link>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      {/* Header */}
      <header className="border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Mic className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold text-white">VoiceAgentAI</h1>
          </div>
          <div className="flex items-center space-x-4">
            <Link
              href="/community"
              className="text-gray-300 hover:text-white transition-colors"
            >
              Community
            </Link>
            <Link
              href="/auth"
              className="text-gray-300 hover:text-white transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="/auth?mode=signup"
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-6 py-20">
        <div className="text-center">
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-6">
            Build Powerful{" "}
            <span className="bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
              Voice Agents
            </span>{" "}
            with AI
          </h1>
          
          <p className="text-xl text-gray-300 mb-12 max-w-3xl mx-auto">
            Create, customize, and deploy intelligent voice assistants with our intuitive platform. 
            Describe your agent and watch it come to life with AI-powered conversations.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
            <Link
              href="/auth?mode=signup"
              className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-medium px-8 py-4 rounded-lg transition-all duration-200 flex items-center justify-center space-x-2"
            >
              <span>Start Building</span>
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              href="/auth"
              className="border border-gray-600 hover:border-gray-500 text-white font-medium px-8 py-4 rounded-lg transition-colors"
            >
              Sign In
            </Link>
          </div>

          {/* Demo Video/Image Placeholder */}
          <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-xl p-8 max-w-4xl mx-auto">
            <div className="aspect-video bg-gray-900/50 rounded-lg flex items-center justify-center">
              <div className="text-center">
                <Mic className="w-16 h-16 text-blue-400 mx-auto mb-4" />
                <p className="text-gray-400">Interactive Voice Agent Demo</p>
                <p className="text-sm text-gray-500 mt-2">Sign up to try it yourself</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Community Projects Section */}
      <section className="bg-white py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Featured{" "}
              <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Community Projects
              </span>
            </h2>
            <p className="text-gray-600 text-lg max-w-3xl mx-auto">
              Discover amazing voice agents created by our community. Get inspired and see what's possible with AI-powered conversations.
            </p>
          </div>
          
          {projectsLoading ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="bg-white border border-gray-200 rounded-xl p-6 animate-pulse">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-gray-200 rounded"></div>
                      <div>
                        <div className="h-5 w-32 bg-gray-200 rounded mb-2"></div>
                        <div className="h-4 w-24 bg-gray-200 rounded"></div>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2 mb-4">
                    <div className="h-4 bg-gray-200 rounded w-full"></div>
                    <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  </div>
                  <div className="flex justify-between">
                    <div className="h-4 w-20 bg-gray-200 rounded"></div>
                    <div className="h-4 w-16 bg-gray-200 rounded"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : featuredProjects.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No community projects available
              </h3>
              <p className="text-gray-600 mb-6">
                Be the first to share your voice agent with the community!
              </p>
              <Link
                href="/auth?mode=signup"
                className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-medium px-6 py-3 rounded-lg transition-all duration-200 inline-flex items-center space-x-2"
              >
                <span>Get Started</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          ) : (
            <>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
                {featuredProjects.map((project) => (
                  <ProjectCard key={project.id} project={project} />
                ))}
              </div>
              
              <div className="text-center">
                <Link
                  href="/community"
                  className="bg-gray-900 hover:bg-gray-800 text-white font-medium px-8 py-4 rounded-lg transition-colors inline-flex items-center space-x-2"
                >
                  <span>Explore All Projects</span>
                  <ArrowRight className="w-5 h-5" />
                </Link>
              </div>
            </>
          )}
        </div>
      </section>

      {/* Features Section */}
      <section className="bg-gray-800/30 py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-white mb-4">Powerful Features</h2>
            <p className="text-gray-300 text-lg">Everything you need to build intelligent voice agents</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard
              icon={<Sparkles className="w-8 h-8 text-yellow-400" />}
              title="AI-Powered Generation"
              description="Describe your agent in natural language and watch it come to life with the perfect personality and capabilities."
            />
            <FeatureCard
              icon={<Mic className="w-8 h-8 text-blue-400" />}
              title="Real-time Voice Interaction"
              description="High-quality voice processing with natural speech recognition and text-to-speech powered by leading AI models."
            />
            <FeatureCard
              icon={<Code className="w-8 h-8 text-green-400" />}
              title="Instant Deployment"
              description="Generate and deploy your voice agent in seconds. No complex setup or infrastructure management required."
            />
            <FeatureCard
              icon={<MessageSquare className="w-8 h-8 text-purple-400" />}
              title="Smart Conversations"
              description="Your agents understand context and maintain natural, engaging conversations with users."
            />
            <FeatureCard
              icon={<div className="text-2xl">🌍</div>}
              title="Multi-language Support"
              description="Create agents that speak multiple languages with native-level fluency and cultural understanding."
            />
            <FeatureCard
              icon={<div className="text-2xl">🎨</div>}
              title="Custom Personalities"
              description="Your agent automatically adapts its personality based on your description and use case."
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold text-white mb-6">
            Ready to Build Your Voice Agent?
          </h2>
          <p className="text-xl text-gray-300 mb-8">
            Join thousands of developers creating the future of voice interaction
          </p>
          <Link
            href="/auth?mode=signup"
            className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-medium px-8 py-4 rounded-lg transition-all duration-200 inline-flex items-center space-x-2"
          >
            <span>Get Started Free</span>
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-12">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <p className="text-gray-400">
            Built with LiveKit, OpenAI, and modern web technologies
          </p>
        </div>
      </footer>
    </div>
  )
}

function FeatureCard({ 
  icon, 
  title, 
  description 
}: { 
  icon: React.ReactNode
  title: string
  description: string 
}) {
  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6 hover:border-gray-600 transition-all duration-200">
      <div className="mb-4">{icon}</div>
      <h3 className="text-xl font-semibold text-white mb-3">{title}</h3>
      <p className="text-gray-300">{description}</p>
    </div>
  )
} 