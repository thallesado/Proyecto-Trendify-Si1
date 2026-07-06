import re

filepath = r'frontend/App.jsx'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('const [publicView, setPublicView] = useState(\'store\');', 'const [publicView, setPublicView] = useState(\'store\');\n  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);')

content = content.replace(
    '<aside className="relative overflow-hidden bg-slate-900 px-5 py-6 text-slate-100">',
    '<aside className={ixed inset-y-0 left-0 z-40 w-72 transform overflow-y-auto bg-slate-900 px-5 py-6 text-slate-100 transition-transform lg:static lg:w-auto lg:translate-x-0 }>'
)

content = content.replace(
    'onClick={() => setActiveView(item.key)}',
    'onClick={() => { setActiveView(item.key); setMobileMenuOpen(false); }}'
)

main_part_old = '''<main className="min-w-0">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-[1500px] items-center justify-between px-6 py-4">
            <div>'''

main_part_new = '''{mobileMenuOpen && (
        <div 
          className="fixed inset-0 z-30 bg-slate-900/50 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}
      <main className="min-w-0 flex flex-col min-h-screen">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-[1500px] items-center justify-between px-4 sm:px-6 py-4">
            <div className="flex items-center gap-3">
              <button 
                type="button"
                className="flex items-center justify-center rounded-lg border border-slate-300 bg-slate-50 p-2 text-slate-700 lg:hidden"
                onClick={() => setMobileMenuOpen(true)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
              </button>
              <div>'''

if main_part_old in content:
    content = content.replace(main_part_old, main_part_new)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("App.jsx patched!")
