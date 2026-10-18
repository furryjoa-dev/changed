# 실제 Data/*.rvdata 의 ivar 를 스캔해서 RPG::* 클래스 정의(web/rgss/05_rpg_classes.rb)를 생성한다.
require 'set'
module RPG; end
$ivars = Hash.new { |h, k| h[k] = Set.new }
$defined = {}
def ensure_class(name)
  return if $defined[name]
  mod = Object
  name.split('::').each_with_index do |pt, i|
    mod.const_set(pt, i == name.split('::').size - 1 ? Class.new : Module.new) unless mod.const_defined?(pt, false)
    mod = mod.const_get(pt)
  end
  $defined[name] = true
end
%w(Table Color Tone Rect).each do |n|
  Object.const_set(n, Class.new do
    define_singleton_method(:_load) { |s| allocate }
    define_method(:_dump) { |l| '' }
  end)
  $defined[n] = true
end
def load_auto(bin)
  Marshal.load(bin)
rescue ArgumentError => e
  raise unless e.message =~ /undefined class\/module (\S+)/
  ensure_class($1)
  retry
end
def walk(o, seen = {}.compare_by_identity)
  return if seen[o]
  case o
  when Array then seen[o] = 1; o.each { |x| walk(x, seen) }
  when Hash then seen[o] = 1; o.each { |k, v| walk(k, seen); walk(v, seen) }
  when String, Symbol, Numeric, NilClass, TrueClass, FalseClass then nil
  else
    seen[o] = 1
    o.instance_variables.each { |iv| $ivars[o.class.name] << iv.to_s.delete('@'); walk(o.instance_variable_get(iv), seen) }
  end
end
root = File.expand_path('..', __dir__)
Dir[File.join(root, 'Data', '*.rvdata')].sort.each { |f| next if f =~ /Scripts/; walk(load_auto(File.binread(f))) }
out = +"# 자동 생성: tools/gen_rpg.rb  (수정하지 말고 생성기를 고칠 것)\nmodule RPG; end\n"
$ivars.keys.grep(/^RPG::/).sort_by { |k| [k.count(':'), k] }.each do |k|
  attrs = $ivars[k].to_a.sort.map { |a| ":#{a}" }.join(', ')
  out << "RPG.const_set(:Dummy, nil) if false\n" if false
  parts = k.split('::')
  out << "__rpg_class(#{parts.map { |s| s.inspect }.join(', ')}, [#{attrs}])\n"
end
File.write(File.join(root, 'web/rgss/05_rpg_classes.rb'), out)
puts "generated #{$ivars.keys.grep(/^RPG::/).size} classes"
