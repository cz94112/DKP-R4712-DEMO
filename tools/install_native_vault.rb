# Run after cap add/sync on macOS; xcodeproj comes with CocoaPods.
require 'xcodeproj'
require 'fileutils'
require 'rexml/document'
root = File.expand_path('..', __dir__)
app = File.join(root, 'ios/App/App')
project = Xcodeproj::Project.open(File.join(root, 'ios/App/App.xcodeproj'))
target = project.targets.find { |t| t.name == 'App' } or abort 'Missing App target'
group = project.main_group['App'] or abort 'Missing App group'
FileUtils.cp(File.join(root, 'NativeVault/DKPVault.swift'), File.join(app, 'DKPVault.swift'))
ref = group.files.find { |f| f.path == 'DKPVault.swift' } || group.new_file('DKPVault.swift')
target.add_file_references([ref]) unless target.source_build_phase.files_references.include?(ref)
project.save
story = File.join(app, 'Base.lproj/Main.storyboard')
doc = REXML::Document.new(File.read(story))
controllers = REXML::XPath.match(doc, '//viewController').select { |v| ['CAPBridgeViewController','DKPBridgeViewController'].include?(v.attributes['customClass']) }
abort 'Expected one Capacitor bridge controller' unless controllers.size == 1
controller = controllers.first
controller.attributes['customClass'] = 'DKPBridgeViewController'
controller.attributes['customModule'] = 'App'
controller.attributes['customModuleProvider'] = 'target'
File.open(story, 'w') { |f| doc.write(f) }
puts 'Native vault registered in App target and storyboard.'
